package pushduck

// The steps every request of an upload shares, whichever way its bytes travel:
// running the metadata hooks, reading the upload back for a request after
// presign, and finishing it.

import (
	"net/http"
)

// upload is what a request after presign acts on: a receipt, or — for tokens
// issued before receipts existed — the same shape rebuilt the old way.
type upload struct {
	ID        string
	Route     string
	Key       string
	File      FileMeta
	Metadata  map[string]any
	Multipart *receiptMultipart
	// Input is the client metadata the hooks run over on every request.
	Input map[string]any
}

func (issued *receipt) upload() upload {
	return upload{
		ID: issued.ID, Route: issued.Route, Key: issued.Key, File: issued.File,
		Metadata: issued.Metadata, Multipart: issued.Multipart, Input: issued.Input,
	}
}

// runMetadata runs the route's metadata hooks for one file and returns what
// they decided.
//
// The client's metadata stands only when no hook runs. A hook's result is
// assigned unconditionally: keeping the previous value when a hook returns
// nil sounds harmless and is not, because that value is the *client's*
// metadata, so an authenticate-only hook — the most natural shape there is —
// would silently promote the caller's own claims to the ones the application
// trusts. A hook that returns nothing leaves the upload with no metadata.
func (route Route) runMetadata(
	r *http.Request, phase Phase, file FileMeta, input map[string]any,
) (map[string]any, error) {
	r = withUpload(r, phase, input)

	metadata := make(map[string]any, len(input))
	for key, value := range input {
		metadata[key] = value
	}

	for _, hook := range route.Metadata {
		produced, err := hook(r, file)
		if err != nil {
			return nil, err
		}
		metadata = produced
	}

	if metadata == nil {
		metadata = map[string]any{}
	}
	return metadata, nil
}

// openUpload reads a multipart upload back from its session and authorises the
// caller for it.
//
// The metadata hooks run over the same file and client metadata presign saw,
// with the phase saying which request this is; their result is discarded. A
// session minted for one route never acts on another, even for a caller
// authorised on both.
func (router *Router) openUpload(
	r *http.Request, routeName string, route Route, token string, phase Phase,
) (upload, error) {
	issued, err := router.openReceipt(token)
	if err != nil {
		return upload{}, err
	}

	if issued != nil {
		if _, err := route.runMetadata(r, phase, issued.File, issued.Input); err != nil {
			return upload{}, err
		}
		if issued.Route != routeName {
			return upload{}, NewError("FORBIDDEN", "This upload does not belong to this route")
		}
		if issued.Multipart == nil {
			return upload{}, NewError("BAD_REQUEST", "This upload is not a multipart upload")
		}
		return issued.upload(), nil
	}

	// ── v1 multipart session (deprecated; remove in 0.9) ────────────────────
	// Issued before receipts. It never carried the file or the metadata, so
	// it keeps the behaviour it had: the hooks run over a placeholder.
	session, err := router.verifySession(token)
	if err != nil {
		return upload{}, err
	}
	if session.Route != routeName {
		return upload{}, NewError("FORBIDDEN", "Invalid or expired multipart session")
	}
	if _, err := route.runMetadata(r, phase, FileMeta{Name: session.Key}, nil); err != nil {
		return upload{}, err
	}

	return upload{
		Route:     session.Route,
		Key:       session.Key,
		File:      FileMeta{Size: session.TotalSize},
		Metadata:  map[string]any{},
		Multipart: &receiptMultipart{UploadID: session.UploadID, PartSize: session.PartSize},
	}, nil
}

// finalize is the one place an upload is finished, single-PUT and multipart
// alike, so nothing about an upload's outcome depends on how large the file
// was.
func (router *Router) finalize(r *http.Request, route Route, done upload) (completionResult, error) {
	if route.OnComplete != nil {
		err := route.OnComplete(withUpload(r, PhaseComplete, done.Input), Upload{
			ID:       done.ID,
			Key:      done.Key,
			File:     done.File,
			Metadata: done.Metadata,
		})
		if err != nil {
			return completionResult{}, err
		}
	}

	host, path := router.config.objectAddress(done.Key)
	return completionResult{
		Success: true,
		Key:     done.Key,
		URL:     "https://" + host + path,
		File:    &done.File,
	}, nil
}

// failedCompletion reports one file's completion failure inside a 200.
func failedCompletion(key string, err error) completionResult {
	typed := asError(err)
	message := typed.Message
	if typed.Internal {
		message = codeTable["INTERNAL_ERROR"].title
	}
	return completionResult{Success: false, Key: key, Error: message, Code: typed.Code}
}
