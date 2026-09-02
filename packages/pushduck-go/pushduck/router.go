package pushduck

// The HTTP surface: an http.Handler that speaks protocol version 1.
//
// Framework-agnosticism is nearly free in Go. `http.Handler` is the interface
// net/http, chi and gorilla already use, and gin and echo wrap it in one line
// (`gin.WrapH`, `echo.WrapHandler`). Where the TypeScript package needs
// adapters per framework, this needs none — so the router is the whole
// integration story.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
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
	Success bool     `json:"success"`
	Key     string   `json:"key"`
	URL     string   `json:"url"`
	File    FileMeta `json:"file"`
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
		metadata := map[string]any{}
		for key, value := range request.Metadata {
			metadata[key] = value
		}

		for _, hook := range route.Metadata {
			produced, err := hook(r, file)
			if err != nil {
				return err
			}
			// Assigned unconditionally. Keeping the previous value when a
			// hook returns nil sounds harmless and is not: that value is
			// the *client's* metadata, so an authenticate-only hook —
			// the most natural shape there is — would silently promote the
			// caller's own identity claims to the ones the application trusts.
			metadata = produced
		}

		// A hook ran and returned nothing, so the upload has no
		// metadata. Never the client's.
		if metadata == nil {
			metadata = map[string]any{}
		}

		if message := route.validate(file); message != "" {
			results = append(results, presignResult{
				Success: false, File: file, Error: message,
			})
			continue
		}

		key := generateKey(file.Name)
		host, path := router.config.objectAddress(key)

		headers := map[string]string{"x-amz-acl": "private"}
		url := router.config.presign(presignOptions{
			Method:    http.MethodPut,
			Host:      host,
			Path:      path,
			Region:    router.config.Region,
			Headers:   headers,
			ExpiresIn: router.config.uploadExpiry(),
			Now:       router.config.now(),
		})

		required := map[string]string{"x-amz-acl": "private"}
		if file.Type != "" {
			required["Content-Type"] = file.Type
		}

		token, err := router.signCompletion(key, routeName)
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

	results := make([]completionResult, 0, len(request.Completions))

	// Authorised in full before any hook runs, so a batch containing one
	// unauthorised entry cannot fire the hook for the others.
	trusted := make([]map[string]any, 0, len(request.Completions))

	for _, entry := range request.Completions {
		if entry.CompletionToken != "" {
			key, route_, err := router.verifyCompletion(entry.CompletionToken)
			if err != nil {
				return err
			}
			if key != entry.Key || route_ != routeName {
				return NewError("FORBIDDEN",
					"This completion does not match the upload it was issued for")
			}
		} else if route.RequireCompletionToken {
			return NewError("FORBIDDEN",
				"This route requires the completion token issued at presign")
		}

		metadata := map[string]any{}
		for key, value := range entry.Metadata {
			metadata[key] = value
		}

		for _, hook := range route.Metadata {
			produced, err := hook(r, entry.File)
			if err != nil {
				return err
			}
			// As at presign: nil means "no metadata", never "keep the
			// client's".
			metadata = produced
		}

		if metadata == nil {
			metadata = map[string]any{}
		}

		trusted = append(trusted, metadata)
	}

	for index, entry := range request.Completions {
		if route.OnComplete != nil {
			if err := route.OnComplete(r, entry.Key, entry.File, trusted[index]); err != nil {
				return err
			}
		}

		host, path := router.config.objectAddress(entry.Key)
		results = append(results, completionResult{
			Success: true,
			Key:     entry.Key,
			URL:     "https://" + host + path,
			File:    entry.File,
		})
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "results": results,
	})
	return nil
}

// ─── completion tokens ──────────────────────────────────────────────────────

// signCompletion binds a key to the route that presigned it.
//
// Same construction as the TypeScript server, including the `completion:`
// prefix on the secret, so the two are interchangeable behind a load balancer
// rather than merely similar.
func (router *Router) signCompletion(key, route string) (string, error) {
	claim, err := json.Marshal(map[string]string{"key": key, "route": route})
	if err != nil {
		return "", NewError("INTERNAL_ERROR", "Could not encode completion token")
	}

	payload := base64.RawURLEncoding.EncodeToString(claim)
	return payload + "." + router.completionSignature(payload), nil
}

func (router *Router) completionSignature(payload string) string {
	mac := hmac.New(sha256.New, []byte("pushduck-multipart:completion:"+router.config.SecretAccessKey))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (router *Router) verifyCompletion(token string) (string, string, error) {
	reject := func() (string, string, error) {
		// One message for every failure mode, so probing reveals nothing about
		// which part was wrong.
		return "", "", NewError("FORBIDDEN", "Invalid completion token")
	}

	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return reject()
	}

	if !hmac.Equal([]byte(parts[1]), []byte(router.completionSignature(parts[0]))) {
		return reject()
	}

	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
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
