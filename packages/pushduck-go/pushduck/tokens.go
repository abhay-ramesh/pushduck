package pushduck

// The one construction behind every token the router issues.
//
// Receipts, multipart sessions and v1 completion tokens are all
// `base64url(JSON) "." base64url(HMAC-SHA256)`, keyed from the provider's
// secret access key with a per-purpose prefix, so a token minted for one
// purpose never verifies as another. The key derivation
// (`pushduck-multipart:<purpose><secret>`) is shared with the TypeScript and
// Python servers; change it in all three or not at all.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
)

// Token purposes. The v1 multipart session predates purposes, so its prefix is
// empty.
const (
	purposeReceipt    = "receipt:"
	purposeCompletion = "completion:"
	purposeSession    = ""
)

func (router *Router) tokenSignature(purpose, payload string) string {
	mac := hmac.New(sha256.New, []byte("pushduck-multipart:"+purpose+router.config.SecretAccessKey))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// sealToken encodes a claim and signs it for one purpose.
func (router *Router) sealToken(purpose string, claim any) (string, error) {
	encoded, err := json.Marshal(claim)
	if err != nil {
		return "", NewError("INTERNAL_ERROR", "Could not encode upload token")
	}
	payload := base64.RawURLEncoding.EncodeToString(encoded)
	return payload + "." + router.tokenSignature(purpose, payload), nil
}

// openToken returns the decoded payload of a token signed for this purpose, or
// false for anything else — a malformed token, another purpose's, a forgery.
// The caller decides what a refusal means, so nothing here distinguishes them.
func (router *Router) openToken(purpose, token string) ([]byte, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil, false
	}

	if !hmac.Equal([]byte(parts[1]), []byte(router.tokenSignature(purpose, parts[0]))) {
		return nil, false
	}

	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, false
	}
	return raw, true
}
