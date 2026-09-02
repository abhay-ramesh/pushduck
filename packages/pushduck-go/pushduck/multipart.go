package pushduck

// Multipart session tokens and the four multipart actions.
//
// A multipart upload spans four requests, and the last three have to name the
// object they act on. If the client sent `{key, uploadId}` directly, anyone
// could sign parts for — or abort — someone else's upload by guessing or
// observing that pair. Route metadata hooks authenticate the *caller*; nothing
// would tie the caller to the object.
//
// So `init` returns an opaque token binding the key, upload id and route under
// an HMAC, and later calls present the token instead of raw identifiers. The
// server re-derives the values rather than trusting anything the client sent.
// Byte-compatible with the TypeScript implementation, including the secret
// prefix, so the two remain interchangeable.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
)

// multipartSession is what a token asserts once verified.
type multipartSession struct {
	Key       string `json:"key"`
	UploadID  string `json:"uploadId"`
	Route     string `json:"route"`
	PartSize  int64  `json:"partSize"`
	TotalSize int64  `json:"totalSize"`
}

func (router *Router) sessionSignature(payload string) string {
	mac := hmac.New(sha256.New, []byte("pushduck-multipart:"+router.config.SecretAccessKey))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (router *Router) signSession(session multipartSession) (string, error) {
	claim, err := json.Marshal(session)
	if err != nil {
		return "", NewError("INTERNAL_ERROR", "Could not encode multipart session")
	}
	payload := base64.RawURLEncoding.EncodeToString(claim)
	return payload + "." + router.sessionSignature(payload), nil
}

func (router *Router) verifySession(token string) (multipartSession, error) {
	// One message for every failure mode, so a probe learns nothing about
	// which part was wrong.
	reject := func() (multipartSession, error) {
		return multipartSession{}, NewError("FORBIDDEN", "Invalid or expired multipart session")
	}

	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return reject()
	}
	if !hmac.Equal([]byte(parts[1]), []byte(router.sessionSignature(parts[0]))) {
		return reject()
	}

	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return reject()
	}

	var session multipartSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return reject()
	}
	// A valid signature over a malformed payload must still not proceed.
	if session.Key == "" || session.UploadID == "" || session.PartSize <= 0 {
		return reject()
	}

	return session, nil
}

// authorizeSession verifies the token *and* re-runs the route's metadata hooks.
//
// Both are required. The token proves which object is being acted on; the
// hooks prove the caller is still allowed to act. Checking only the token
// would let a revoked user finish an upload they started.
func (router *Router) authorizeSession(
	r *http.Request, routeName string, route Route, token string,
) (multipartSession, error) {
	session, err := router.verifySession(token)
	if err != nil {
		return multipartSession{}, err
	}

	if session.Route != routeName {
		return multipartSession{}, NewError("FORBIDDEN", "Invalid or expired multipart session")
	}

	for _, hook := range route.Metadata {
		if _, err := hook(r, FileMeta{Name: session.Key}); err != nil {
			return multipartSession{}, err
		}
	}

	return session, nil
}

// ─── limits ─────────────────────────────────────────────────────────────────

const (
	mib = 1 << 20
	// The intersection of every supported provider's limits.
	minPartSize     = 5 * mib
	maxPartSize     = 5 * 1024 * mib
	maxParts        = 10_000
	defaultPartSize = 5 * mib
)

// choosePartSize clamps a requested size into the provider-safe range and
// raises it when the 10,000-part cap would otherwise be exceeded.
//
// Parts are uniform except the last. That is stricter than S3 requires and
// deliberate: Cloudflare R2 rejects an upload whose non-final parts differ in
// size, so uniform parts are the only sizing that works everywhere.
func choosePartSize(totalSize, requested int64) int64 {
	size := requested
	if size <= 0 {
		size = defaultPartSize
	}
	if size < minPartSize {
		size = minPartSize
	}
	if size > maxPartSize {
		size = maxPartSize
	}

	for totalSize > size*maxParts {
		size *= 2
		if size > maxPartSize {
			return maxPartSize
		}
	}

	return size
}

// ─── actions ────────────────────────────────────────────────────────────────

type multipartInitRequest struct {
	File     FileMeta       `json:"file"`
	Metadata map[string]any `json:"metadata"`
	PartSize int64          `json:"partSize"`
}

type multipartSignRequest struct {
	Session     string `json:"session"`
	PartNumbers []int  `json:"partNumbers"`
}

type multipartCompleteRequest struct {
	Session  string          `json:"session"`
	Parts    []CompletedPart `json:"parts"`
	File     FileMeta        `json:"file"`
	Metadata map[string]any  `json:"metadata"`
}

type multipartSessionRequest struct {
	Session string `json:"session"`
}

func (router *Router) multipartInit(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request multipartInitRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}
	if request.File.Size <= 0 {
		return NewError("BAD_REQUEST",
			"`file` with name, size and type is required to start a multipart upload")
	}

	// Metadata hooks and validation run here exactly as they do for a single PUT,
	// so a multipart upload cannot bypass a route's constraints.
	metadata := map[string]any{}
	for key, value := range request.Metadata {
		metadata[key] = value
	}
	for _, hook := range route.Metadata {
		produced, err := hook(r, request.File)
		if err != nil {
			return err
		}
		if produced != nil {
			metadata = produced
		}
	}

	if message := route.validate(request.File); message != "" {
		return NewError("VALIDATION_FAILED", message)
	}

	key := generateKey(request.File.Name)
	uploadID, err := router.config.createMultipartUpload(key, request.File.Type)
	if err != nil {
		return err
	}

	partSize := choosePartSize(request.File.Size, request.PartSize)

	token, err := router.signSession(multipartSession{
		Key: key, UploadID: uploadID, Route: routeName,
		PartSize: partSize, TotalSize: request.File.Size,
	})
	if err != nil {
		// The session exists at the provider but cannot be handed out, so it
		// would be billed forever with nobody able to finish or abort it.
		_ = router.config.abortMultipartUpload(key, uploadID)
		return err
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "session": token, "key": key,
		"partSize": partSize, "metadata": metadata,
	})
	return nil
}

func (router *Router) multipartSign(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request multipartSignRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}
	if request.PartNumbers == nil {
		return NewError("BAD_REQUEST", "`partNumbers` must be an array")
	}

	session, err := router.authorizeSession(r, routeName, route, request.Session)
	if err != nil {
		return err
	}

	maxPart := int((session.TotalSize + session.PartSize - 1) / session.PartSize)
	if maxPart < 1 {
		maxPart = 1
	}

	signed := make([]map[string]any, 0, len(request.PartNumbers))
	for _, partNumber := range request.PartNumbers {
		// A part number outside the plan would sign a write past the end of
		// the object the session was created for.
		if partNumber < 1 || partNumber > maxPart {
			return NewError("BAD_REQUEST",
				"Part number is outside this upload")
		}

		start := int64(partNumber-1) * session.PartSize
		size := session.PartSize
		if remaining := session.TotalSize - start; remaining < size {
			size = remaining
		}

		signed = append(signed, map[string]any{
			"partNumber": partNumber,
			"url":        router.config.presignUploadPart(session.Key, session.UploadID, partNumber),
			"size":       size,
		})
	}

	writeJSON(w, http.StatusOK, telemetry, signed)
	return nil
}

func (router *Router) multipartComplete(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request multipartCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}
	if request.Parts == nil {
		return NewError("BAD_REQUEST", "`parts` must be an array")
	}

	session, err := router.authorizeSession(r, routeName, route, request.Session)
	if err != nil {
		return err
	}

	if err := router.config.completeMultipartUpload(session.Key, session.UploadID, request.Parts); err != nil {
		return err
	}

	if route.OnComplete != nil {
		metadata := map[string]any{}
		for key, value := range request.Metadata {
			metadata[key] = value
		}
		if err := route.OnComplete(r, session.Key, request.File, metadata); err != nil {
			return err
		}
	}

	host, path := router.config.objectAddress(session.Key)
	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "key": session.Key, "url": "https://" + host + path,
	})
	return nil
}

func (router *Router) multipartAbort(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request multipartSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}

	session, err := router.authorizeSession(r, routeName, route, request.Session)
	if err != nil {
		return err
	}

	if err := router.config.abortMultipartUpload(session.Key, session.UploadID); err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{"success": true})
	return nil
}

func (router *Router) multipartParts(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request multipartSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}

	session, err := router.authorizeSession(r, routeName, route, request.Session)
	if err != nil {
		return err
	}

	parts, err := router.config.listUploadedParts(session.Key, session.UploadID)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "parts": parts,
	})
	return nil
}
