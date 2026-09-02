package pushduck

// Typed errors and RFC 9457 problem documents.
//
// The code table is copied deliberately rather than reinvented. A client
// branches on `code` — re-authenticating on UNAUTHORIZED, retrying on
// RATE_LIMITED — so a Go server that named its codes differently would be a
// different product wearing the same protocol.

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Error is a failure with a protocol code, an HTTP status and a retry hint.
type Error struct {
	Code      string
	Message   string
	Status    int
	Retryable bool
	// Internal marks a detail as unsafe to disclose. Bare Go errors routinely
	// carry hostnames, credentials and query fragments, and the TypeScript
	// server withholds them for exactly that reason.
	Internal bool
}

func (e *Error) Error() string { return e.Message }

type codeDefinition struct {
	status    int
	title     string
	retryable bool
}

// The same table as `upload-error.ts`, grouped by who is at fault.
var codeTable = map[string]codeDefinition{
	"UNAUTHORIZED":          {http.StatusUnauthorized, "Authentication required", false},
	"FORBIDDEN":             {http.StatusForbidden, "Not allowed", false},
	"NOT_FOUND":             {http.StatusNotFound, "Not found", false},
	"BAD_REQUEST":           {http.StatusBadRequest, "Malformed request", false},
	"VALIDATION_FAILED":     {http.StatusBadRequest, "File failed validation", false},
	"FILE_TOO_LARGE":        {http.StatusRequestEntityTooLarge, "File too large", false},
	"FILE_TYPE_NOT_ALLOWED": {http.StatusUnsupportedMediaType, "File type not allowed", false},
	"TOO_MANY_FILES":        {http.StatusBadRequest, "Too many files", false},
	"PAYLOAD_TOO_LARGE":     {http.StatusRequestEntityTooLarge, "Payload too large", false},
	"RATE_LIMITED":          {http.StatusTooManyRequests, "Rate limit exceeded", true},
	"QUOTA_EXCEEDED":        {http.StatusTooManyRequests, "Quota exceeded", true},
	"STORAGE_UNAVAILABLE":   {http.StatusBadGateway, "Storage unavailable", true},
	"STORAGE_ACCESS_DENIED": {http.StatusBadGateway, "Storage rejected the request", false},
	"NETWORK_ERROR":         {http.StatusBadGateway, "Network error", true},
	"TIMEOUT":               {http.StatusGatewayTimeout, "Operation timed out", true},
	"CONFIG_INVALID":        {http.StatusInternalServerError, "Server misconfigured", false},
	"INTERNAL_ERROR":        {http.StatusInternalServerError, "Internal error", false},
	"UPLOAD_CANCELLED":      {499, "Upload cancelled", false},
}

// NewError builds an error from a protocol code.
func NewError(code, message string) *Error {
	definition, known := codeTable[code]
	if !known {
		definition = codeTable["INTERNAL_ERROR"]
		code = "INTERNAL_ERROR"
	}

	return &Error{
		Code:      code,
		Message:   message,
		Status:    definition.status,
		Retryable: definition.retryable,
	}
}

// asError classifies any error for the wire.
//
// A bare error becomes an INTERNAL_ERROR whose message is withheld. That is a
// deliberate asymmetry with the typed path: an application author choosing
// UNAUTHORIZED has decided the message is safe to show, whereas a wrapped
// driver error has not been vetted by anyone.
func asError(err error) *Error {
	if typed, ok := err.(*Error); ok {
		return typed
	}

	internal := NewError("INTERNAL_ERROR", "An unexpected error occurred")
	internal.Internal = true
	return internal
}

// problemDocument is the RFC 9457 body.
type problemDocument struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Status    int    `json:"status"`
	Detail    string `json:"detail,omitempty"`
	Instance  string `json:"instance,omitempty"`
	Code      string `json:"code"`
	Retryable bool   `json:"retryable"`
	// Legacy mirror of Detail, kept because clients before 0.7 render this
	// field and would otherwise show an empty failure.
	LegacyError string `json:"error,omitempty"`
}

// writeProblem sends an error as `application/problem+json`.
func writeProblem(w http.ResponseWriter, r *http.Request, err *Error, telemetry map[string]string) {
	definition, known := codeTable[err.Code]
	if !known {
		definition = codeTable["INTERNAL_ERROR"]
	}

	detail := err.Message
	if err.Internal {
		// Withheld, not blanked: the title still says what class of thing
		// happened, so the response remains useful without disclosing.
		detail = ""
	}

	document := problemDocument{
		Type:        "https://pushduck.org/errors/" + strings.ToLower(strings.ReplaceAll(err.Code, "_", "-")),
		Title:       definition.title,
		Status:      err.Status,
		Detail:      detail,
		Instance:    r.URL.RequestURI(),
		Code:        err.Code,
		Retryable:   err.Retryable,
		LegacyError: detail,
	}

	for key, value := range telemetry {
		w.Header().Set(key, value)
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(err.Status)

	_ = json.NewEncoder(w).Encode(document)
}
