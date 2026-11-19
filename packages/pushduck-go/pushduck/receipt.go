package pushduck

// Upload receipts — the server's sealed record of what it authorised.
//
// An upload spans several requests: presign, the transfer itself, completion,
// and for multipart the part signing in between. Only presign runs with the
// full picture — the caller's input, the metadata hooks' decision, the key
// derived from them. Every later request has to act on that decision, and the
// only party carrying state between requests is the client.
//
// So presign hands the client a receipt: the route, the key, the file as
// declared, the client's metadata exactly as received, what the metadata hooks
// returned, and an expiry, sealed with an HMAC the client cannot forge. Later
// requests present the receipt instead of restating any of it, and the server
// reads its own record back. That is what keeps a completion request from
// rewriting the metadata OnComplete receives, or pointing it at someone else's
// object.
//
// Receipts are signed, not encrypted. The presign response already returns the
// metadata to the client, so sealing it exposes nothing new — but a metadata
// hook must never return a secret.
//
// The format is shared with the TypeScript and Python servers, so a receipt
// issued by one completes on another.

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"time"
)

// receipt is what presign authorised, as the client carries it.
type receipt struct {
	V int `json:"v"`
	// ID is random and stable across every request of one upload, so
	// OnComplete can use it as an idempotency key for a retried completion.
	ID    string   `json:"id"`
	Route string   `json:"route"`
	Key   string   `json:"key"`
	File  FileMeta `json:"file"`
	// Input is the client's metadata exactly as presign received it.
	Input map[string]any `json:"input"`
	// Metadata is what the metadata hooks returned: the authoritative record.
	Metadata  map[string]any    `json:"metadata"`
	Multipart *receiptMultipart `json:"multipart,omitempty"`
	// Exp is unix seconds; the receipt is refused from then on.
	Exp int64 `json:"exp"`
}

// receiptMultipart is the part plan of a multipart upload.
type receiptMultipart struct {
	UploadID string `json:"uploadId"`
	// PartSize is uniform except for the last part; File.Size bounds the count.
	PartSize int64 `json:"partSize"`
}

const receiptVersion = 2

const (
	// completionGrace is how long after a single-PUT URL expires its receipt
	// can still complete it: the PUT may start at the last moment and take a
	// while.
	completionGrace = time.Hour
	// multipartReceiptLifetime covers a large upload resumed after a network
	// loss. R2 aborts abandoned multipart uploads after seven days.
	multipartReceiptLifetime = 7 * 24 * time.Hour
)

// newUploadID returns 128 random bits, base64url.
func newUploadID() string {
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		panic("pushduck: no randomness for an upload id: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(id)
}

// sealReceipt issues the token handed to the client.
func (router *Router) sealReceipt(issued receipt) (string, error) {
	issued.V = receiptVersion
	// Both are objects on the wire, never null: the other servers refuse a
	// receipt whose input or metadata is not an object.
	if issued.Input == nil {
		issued.Input = map[string]any{}
	}
	if issued.Metadata == nil {
		issued.Metadata = map[string]any{}
	}
	return router.sealToken(purposeReceipt, issued)
}

// openReceipt reads a receipt back.
//
// It returns nil and no error for a token that is not a receipt at all — a v1
// completion token, a v1 multipart session, a forgery — so the caller can try
// an older format. A genuine receipt that is expired or malformed is refused
// with FORBIDDEN, one message for every reason, so probing a token reveals
// nothing about which part failed.
func (router *Router) openReceipt(token string) (*receipt, error) {
	raw, ok := router.openToken(purposeReceipt, token)
	if !ok {
		return nil, nil
	}

	// From here the token is genuinely ours: any further problem is a
	// refusal, not "some other format".
	refuse := NewError("FORBIDDEN", "Invalid or expired upload receipt")

	var opened receipt
	if err := json.Unmarshal(raw, &opened); err != nil {
		return nil, refuse
	}

	wellFormed := opened.V == receiptVersion &&
		opened.ID != "" && opened.Route != "" && opened.Key != "" &&
		opened.Input != nil && opened.Metadata != nil &&
		(opened.Multipart == nil ||
			(opened.Multipart.UploadID != "" && opened.Multipart.PartSize > 0))
	if !wellFormed {
		return nil, refuse
	}

	if !router.config.now().Before(time.Unix(opened.Exp, 0)) {
		return nil, refuse
	}

	return &opened, nil
}
