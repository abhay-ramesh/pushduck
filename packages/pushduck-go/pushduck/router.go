package pushduck

// The HTTP surface: an http.Handler that speaks protocol version 1.
//
// Framework-agnosticism is nearly free in Go. `http.Handler` is the interface
// net/http, chi and gorilla already use, and gin and echo wrap it in one line
// (`gin.WrapH`, `echo.WrapHandler`). Where the TypeScript package needs
// adapters per framework, this needs none — so the router is the whole
// integration story.

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ProtocolVersion is the wire contract this implementation speaks.
const ProtocolVersion = 1

// Router serves one endpoint for a set of named routes.
type Router struct {
	config Config
	routes map[string]Route
}

// Routes maps a route name to its definition.
type Routes map[string]Route

// NewRouter builds a handler for the given routes.
func NewRouter(config Config, routes Routes) *Router {
	return &Router{config: config, routes: routes}
}

// ─── wire shapes ────────────────────────────────────────────────────────────

type presignRequest struct {
	Files    []FileMeta     `json:"files"`
	Metadata map[string]any `json:"metadata"`
}

type presignResult struct {
	Success         bool              `json:"success"`
	File            FileMeta          `json:"file"`
	PresignedURL    string            `json:"presignedUrl,omitempty"`
	Key             string            `json:"key,omitempty"`
	RequiredHeaders map[string]string `json:"requiredHeaders,omitempty"`
	Metadata        map[string]any    `json:"metadata,omitempty"`
	CompletionToken string            `json:"completionToken,omitempty"`
	Error           string            `json:"error,omitempty"`
	Code            string            `json:"code,omitempty"`
}

type completion struct {
	Key             string         `json:"key"`
	File            FileMeta       `json:"file"`
	Metadata        map[string]any `json:"metadata"`
	CompletionToken string         `json:"completionToken"`
}

type completeRequest struct {
	Completions []completion `json:"completions"`
}

type completionResult struct {
	Success bool      `json:"success"`
	Key     string    `json:"key"`
	URL     string    `json:"url,omitempty"`
	File    *FileMeta `json:"file,omitempty"`
	Error   string    `json:"error,omitempty"`
	// Code is the failure's protocol code, so a client can tell an upload
	// that never arrived (NOT_FOUND) from one that was refused
	// (VALIDATION_FAILED) without parsing Error.
	Code string `json:"code,omitempty"`
}

// ─── dispatch ───────────────────────────────────────────────────────────────

func (router *Router) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	routeName := r.URL.Query().Get("route")
	action := r.URL.Query().Get("action")
	if action == "" {
		// Omitting `action` means presign, or every client would have to send
		// a parameter with only one sensible value.
		action = "presign"
	}

	// Set on every response, including failures: a client that reads the
	// header to negotiate behaviour needs it most on the responses an older
	// server is likeliest to produce.
	telemetry := map[string]string{
		"X-Pushduck-Protocol": fmt.Sprintf("%d", ProtocolVersion),
		"X-Pushduck-Action":   action,
	}
	if routeName != "" {
		telemetry["X-Pushduck-Route"] = routeName
	}

	if r.Method == http.MethodGet && routeName == "" {
		router.introspect(w, telemetry)
		return
	}

	route, known := router.routes[routeName]
	if !known {
		writeProblem(w, r, NewError("NOT_FOUND", fmt.Sprintf("Route %q not found", routeName)), telemetry)
		return
	}

	var err error
	switch action {
	case "presign":
		err = router.presign(w, r, routeName, route, telemetry)
	case "complete":
		err = router.complete(w, r, routeName, route, telemetry)
	case "multipart-init":
		err = router.multipartInit(w, r, routeName, route, telemetry)
	case "multipart-sign":
		err = router.multipartSign(w, r, routeName, route, telemetry)
	case "multipart-complete":
		err = router.multipartComplete(w, r, routeName, route, telemetry)
	case "multipart-abort":
		err = router.multipartAbort(w, r, routeName, route, telemetry)
	case "multipart-parts":
		err = router.multipartParts(w, r, routeName, route, telemetry)
	default:
		err = NewError("BAD_REQUEST", fmt.Sprintf("Unknown action: %s", action))
	}

	if err != nil {
		writeProblem(w, r, asError(err), telemetry)
	}
}

func (router *Router) introspect(w http.ResponseWriter, telemetry map[string]string) {
	type routeInfo struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}

	infos := make([]routeInfo, 0, len(router.routes))
	for name := range router.routes {
		infos = append(infos, routeInfo{Name: name, Type: "s3-upload"})
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success":         true,
		"protocolVersion": ProtocolVersion,
		"routes":          infos,
		// Optional parts of the protocol this server implements. Without it a
		// client can only discover multipart support by attempting
		// `multipart-init` and interpreting a 400, which is indistinguishable
		// from a malformed request.
		"features": []string{"multipart"},
	})
}

// ─── presign ────────────────────────────────────────────────────────────────

func (router *Router) presign(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request presignRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}

	if request.Files == nil {
		return NewError("BAD_REQUEST", "`files` must be an array of file descriptors")
	}

	results := make([]presignResult, 0, len(request.Files))

	for _, file := range request.Files {
		// Metadata hooks authenticate the *request*, so a rejection fails all of
		// it. This is the distinction the conformance suite pins down: a
		// request-scoped failure is a status, a file-scoped one is an entry.
		metadata, err := route.runMetadata(r, PhasePresign, file, request.Metadata)
		if err != nil {
			return err
		}

		if message := route.validate(file); message != "" {
			results = append(results, presignResult{
				Success: false, File: file, Error: message,
			})
			continue
		}

		key, err := route.objectKey(r, file)
		var refused keyRefusal
		if errors.As(err, &refused) {
			// The key this file would have had is unsafe: that file fails,
			// the rest of the batch carries on.
			results = append(results, presignResult{
				Success: false, File: file, Error: refused.refused.Message, Code: refused.refused.Code,
			})
			continue
		}
		if err != nil {
			return err
		}
		host, path := router.config.objectAddress(key)

		// The declared size is signed, so storage refuses a body of any other
		// length and MaxSize holds for the bytes that arrive, not only for the
		// number the client sent. It is not handed back in requiredHeaders: a
		// browser sets Content-Length from the body and will not let script
		// set it.
		url := router.config.presign(presignOptions{
			Method: http.MethodPut,
			Host:   host,
			Path:   path,
			Region: router.config.Region,
			Headers: map[string]string{
				"x-amz-acl":      "private",
				"content-length": strconv.FormatInt(file.Size, 10),
			},
			ExpiresIn: router.config.uploadExpiry(),
			Now:       router.config.now(),
		})

		required := map[string]string{"x-amz-acl": "private"}
		if file.Type != "" {
			required["Content-Type"] = file.Type
		}

		// The completion token is the upload's receipt: completion reads the
		// key, the file and the metadata back from it instead of trusting the
		// request, so a caller can neither finish someone else's upload nor
		// rewrite what the hooks decided here.
		token, err := router.sealReceipt(receipt{
			ID:       newUploadID(),
			Route:    routeName,
			Key:      key,
			File:     file,
			Input:    request.Metadata,
			Metadata: metadata,
			Exp: router.config.now().
				Add(time.Duration(router.config.uploadExpiry())*time.Second + completionGrace).Unix(),
		})
		if err != nil {
			return err
		}

		results = append(results, presignResult{
			Success:         true,
			File:            file,
			PresignedURL:    url,
			Key:             key,
			RequiredHeaders: required,
			Metadata:        metadata,
			CompletionToken: token,
		})
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "results": results,
	})
	return nil
}

// ─── complete ───────────────────────────────────────────────────────────────

// complete finishes single-PUT uploads.
//
// Each completion presents the receipt its presign issued, and the receipt is
// the authority on what is being finished — which key, which file, which
// metadata. The metadata hooks still run, over the same input as at presign,
// so a caller who has lost access since is refused; what they return is
// discarded.
func (router *Router) complete(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request completeRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}

	if request.Completions == nil {
		return NewError("BAD_REQUEST", "`completions` must be an array")
	}

	mismatch := NewError("FORBIDDEN", "This completion does not match the upload it was issued for")

	// Authorised in full before any hook runs, so a batch containing one
	// unauthorised entry cannot fire the hook for the others.
	authorised := make([]upload, 0, len(request.Completions))

	for _, entry := range request.Completions {
		// Caller first, then object.
		//
		// The order decides the status code. An anonymous caller has neither a
		// session nor a token, and "sign in" is the accurate, actionable answer
		// — 401. Checking the token first answers "your token is missing", a
		// 403 that tells a logged-out user to fix something they cannot fix.
		issued, refusal := router.openReceipt(entry.CompletionToken)

		if issued != nil {
			if _, err := route.runMetadata(r, PhaseComplete, issued.File, issued.Input); err != nil {
				return err
			}
			if issued.Route != routeName || issued.Key != entry.Key || issued.Multipart != nil {
				return mismatch
			}
			authorised = append(authorised, issued.upload())
			continue
		}

		// ── no receipt: a v1 token or none (deprecated; remove in 0.9) ──────
		// An upload presigned before receipts and completed after the deploy
		// keeps the behaviour it was issued under: the hooks run over the
		// metadata the client echoes back.
		metadata, err := route.runMetadata(r, PhaseComplete, entry.File, entry.Metadata)
		if err != nil {
			return err
		}

		if refusal != nil {
			return refusal
		}

		if entry.CompletionToken != "" {
			key, issuedRoute, err := router.verifyCompletion(entry.CompletionToken)
			if err != nil {
				return err
			}
			if key != entry.Key || issuedRoute != routeName {
				return mismatch
			}
		} else if !route.AllowUntokenedCompletion {
			return NewError("FORBIDDEN",
				"This route requires the completion token issued at presign")
		}

		authorised = append(authorised, upload{
			Route: routeName, Key: entry.Key, File: entry.File, Metadata: metadata,
		})
	}

	results := make([]completionResult, 0, len(authorised))
	for _, done := range authorised {
		result, err := router.finalize(r, route, done)
		if err != nil {
			// One file's outcome, reported in its own entry: the batch was
			// authorised, and the others may well have finished.
			result = failedCompletion(done.Key, err)
		}
		results = append(results, result)
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "results": results,
	})
	return nil
}

// ─── completion tokens (v1, deprecated; remove in 0.9) ──────────────────────

// verifyCompletion reads a v1 completion token, which bound only a key to a
// route. Presign issues receipts now; these are still accepted for uploads
// that were in flight across the deploy.
func (router *Router) verifyCompletion(token string) (string, string, error) {
	// One message for every failure mode, so probing reveals nothing about
	// which part was wrong.
	reject := func() (string, string, error) {
		return "", "", NewError("FORBIDDEN", "Invalid completion token")
	}

	raw, ok := router.openToken(purposeCompletion, token)
	if !ok {
		return reject()
	}

	var claim struct {
		Key   string `json:"key"`
		Route string `json:"route"`
	}
	if err := json.Unmarshal(raw, &claim); err != nil || claim.Key == "" {
		return reject()
	}

	return claim.Key, claim.Route, nil
}

// ─── helpers ────────────────────────────────────────────────────────────────

// objectAddress returns the host and path an object lives at, honouring
// path-style addressing where the provider requires it.
func (c *Config) objectAddress(key string) (host string, path string) {
	if c.Endpoint != "" {
		host = strings.TrimPrefix(strings.TrimPrefix(c.Endpoint, "https://"), "http://")
		if c.ForcePathStyle {
			return host, "/" + c.Bucket + "/" + key
		}
		return c.Bucket + "." + host, "/" + key
	}

	return fmt.Sprintf("%s.s3.%s.amazonaws.com", c.Bucket, c.Region), "/" + key
}

func writeJSON(w http.ResponseWriter, status int, telemetry map[string]string, body any) {
	for key, value := range telemetry {
		w.Header().Set(key, value)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
