package pushduck

import (
	"context"
	"net/http"
)

// Phase says which request of an upload a hook is running for.
//
// Metadata hooks run on every request of an upload, always with the same file
// and the same client metadata presign received, so they can authorise each
// request the same way. Work that must happen once — reserving quota, writing
// an audit row — belongs in PhasePresign; checks that must hold until the end
// (the caller is still signed in, still a member) belong in every phase.
type Phase string

const (
	// PhasePresign is the upload being authorised: a key is chosen and a URL
	// or multipart session issued. A metadata hook's return value becomes the
	// upload's metadata here, and only here.
	PhasePresign Phase = "presign"
	// PhaseUpload is a multipart upload signing, listing or aborting parts.
	PhaseUpload Phase = "upload"
	// PhaseComplete is the upload being finished, just before OnComplete runs
	// with the metadata decided at presign.
	PhaseComplete Phase = "complete"
)

type uploadContextKey struct{}

type uploadContext struct {
	phase Phase
	input map[string]any
}

// withUpload returns r carrying the phase and the client's metadata for the
// hooks that run on it.
func withUpload(r *http.Request, phase Phase, input map[string]any) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), uploadContextKey{}, uploadContext{phase, input}))
}

// PhaseOf reports which request of an upload r is. It is empty outside a hook.
//
//	if pushduck.PhaseOf(r) == pushduck.PhasePresign {
//	    if err := quota.Reserve(user, file.Size); err != nil { ... }
//	}
func PhaseOf(r *http.Request) Phase {
	upload, _ := r.Context().Value(uploadContextKey{}).(uploadContext)
	return upload.phase
}

// ClientMetadata is the metadata the client sent at presign, exactly as
// received, on every request of the upload.
//
// Untrusted, always: validate what you read from it, and never take identity
// from it. Do not modify the map.
func ClientMetadata(r *http.Request) map[string]any {
	upload, _ := r.Context().Value(uploadContextKey{}).(uploadContext)
	return upload.input
}
