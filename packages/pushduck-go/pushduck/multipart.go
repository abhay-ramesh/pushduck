package pushduck

// Multipart sessions and the five multipart actions.
//
// A multipart upload spans several requests, and every one after `init` has to
// name the object it acts on. If the client sent `{key, uploadId}` directly,
// anyone could sign parts for — or abort — someone else's upload by guessing or
// observing that pair. Route metadata hooks authenticate the *caller*; nothing
// would tie the caller to the object.
//
// So `init` returns the upload's receipt with the part plan attached, and later
// calls present it instead of raw identifiers. The server reads the key, the
// upload id, the file and the client's metadata back from it rather than
// trusting anything the client sent, and assembly finishes through the same
// step as a single PUT.

import (
	"encoding/json"
	"net/http"
)

// ─── v1 sessions (deprecated; remove in 0.9) ────────────────────────────────

// multipartSession is what a v1 session asserted. Sessions are receipts now;
// these are still accepted for uploads that were in flight across the deploy.
type multipartSession struct {
	Key       string `json:"key"`
	UploadID  string `json:"uploadId"`
	Route     string `json:"route"`
	PartSize  int64  `json:"partSize"`
	TotalSize int64  `json:"totalSize"`
}

func (router *Router) verifySession(token string) (multipartSession, error) {
	// One message for every failure mode, so a probe learns nothing about
	// which part was wrong.
	reject := func() (multipartSession, error) {
		return multipartSession{}, NewError("FORBIDDEN", "Invalid or expired multipart session")
	}

	raw, ok := router.openToken(purposeSession, token)
	if !ok {
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
	Session string          `json:"session"`
	Parts   []CompletedPart `json:"parts"`
	// Deprecated: read from the receipt. Used only for a v1 session, which
	// never carried the file or the metadata.
	File     FileMeta       `json:"file"`
	Metadata map[string]any `json:"metadata"`
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
	metadata, err := route.runMetadata(r, PhasePresign, request.File, request.Metadata)
	if err != nil {
		return err
	}

	if message := route.validate(request.File); message != "" {
		return NewError("VALIDATION_FAILED", message)
	}

	key, err := route.objectKey(r, request.File)
	if err != nil {
		return err
	}
	uploadID, err := router.config.createMultipartUpload(key, request.File.Type)
	if err != nil {
		return err
	}

	partSize := choosePartSize(request.File.Size, request.PartSize)

	// The session *is* the upload's receipt, with the part plan attached:
	// every part request and the final assembly read it back.
	session, err := router.sealReceipt(receipt{
		ID:        newUploadID(),
		Route:     routeName,
		Key:       key,
		File:      request.File,
		Input:     request.Metadata,
		Metadata:  metadata,
		Multipart: &receiptMultipart{UploadID: uploadID, PartSize: partSize},
		Exp:       router.config.now().Add(multipartReceiptLifetime).Unix(),
	})
	if err != nil {
		// The session exists at the provider but cannot be handed out, so it
		// would be billed forever with nobody able to finish or abort it.
		_ = router.config.abortMultipartUpload(key, uploadID)
		return err
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "session": session, "key": key,
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

	current, err := router.openUpload(r, routeName, route, request.Session, PhaseUpload)
	if err != nil {
		return err
	}
	plan, total := current.Multipart, current.File.Size

	maxPart := int((total + plan.PartSize - 1) / plan.PartSize)
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

		start := int64(partNumber-1) * plan.PartSize
		size := plan.PartSize
		if remaining := total - start; remaining < size {
			size = remaining
		}

		signed = append(signed, map[string]any{
			"partNumber": partNumber,
			"url":        router.config.presignUploadPart(current.Key, plan.UploadID, partNumber),
			"size":       size,
		})
	}

	writeJSON(w, http.StatusOK, telemetry, signed)
	return nil
}

// multipartComplete stitches the parts, then finishes the upload exactly as a
// single-PUT completion does — same hook, same metadata, same guarantees.
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

	current, err := router.openUpload(r, routeName, route, request.Session, PhaseComplete)
	if err != nil {
		return err
	}

	if err := router.config.completeMultipartUpload(current.Key, current.Multipart.UploadID, request.Parts); err != nil {
		return err
	}

	// A v1 session never carried the file or the metadata; it keeps the
	// behaviour it had, the body's claims, until it is removed.
	if current.ID == "" {
		current.File = request.File
		current.Metadata = request.Metadata
		if current.Metadata == nil {
			current.Metadata = map[string]any{}
		}
	}

	result, err := router.finalize(r, route, current)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, telemetry, result)
	return nil
}

// multipartAbort discards an upload. Abandoned parts are billed until removed.
func (router *Router) multipartAbort(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request multipartSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}

	current, err := router.openUpload(r, routeName, route, request.Session, PhaseUpload)
	if err != nil {
		return err
	}

	if err := router.config.abortMultipartUpload(current.Key, current.Multipart.UploadID); err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{"success": true})
	return nil
}

// multipartParts lists the parts the provider actually holds, for resume. The
// provider is the authority; a client's own record is a hint.
func (router *Router) multipartParts(
	w http.ResponseWriter, r *http.Request, routeName string, route Route,
	telemetry map[string]string,
) error {
	var request multipartSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return NewError("BAD_REQUEST", "Request body must be JSON")
	}

	current, err := router.openUpload(r, routeName, route, request.Session, PhaseUpload)
	if err != nil {
		return err
	}

	parts, err := router.config.listUploadedParts(current.Key, current.Multipart.UploadID)
	if err != nil {
		return err
	}

	writeJSON(w, http.StatusOK, telemetry, map[string]any{
		"success": true, "parts": parts,
	})
	return nil
}
