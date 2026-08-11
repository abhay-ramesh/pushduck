package pushduck

// SigV4 query presigning.
//
// This is the only cryptography in the request path, and the only place where
// a Go implementation can be self-consistently wrong: a signature derived with
// the wrong canonical request is still a valid-looking URL, and only the
// provider rejects it. The TypeScript implementation delegates to aws4fetch;
// here it is written out, because pulling in the AWS SDK for one signature
// would dwarf the rest of this package.
//
// Reference: "Authenticating Requests: Using Query Parameters (AWS Signature
// Version 4)" — the canonical request, the string to sign, and the signing key
// derivation are all fixed by that document and none of it is negotiable.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	algorithm       = "AWS4-HMAC-SHA256"
	unsignedPayload = "UNSIGNED-PAYLOAD"
)

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

func sha256Hex(data string) string {
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

// uriEncode percent-encodes per S3's rules rather than Go's.
//
// `url.QueryEscape` encodes a space as `+`, which S3 does not accept in a
// canonical request, and leaves some characters unescaped that S3 expects
// escaped. Getting this wrong produces a signature mismatch on exactly the
// filenames users complain about — the ones with spaces and non-ASCII
// characters.
func uriEncode(s string, encodeSlash bool) string {
	var b strings.Builder

	for _, c := range []byte(s) {
		switch {
		case (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~':
			b.WriteByte(c)
		case c == '/':
			if encodeSlash {
				b.WriteString("%2F")
			} else {
				b.WriteByte('/')
			}
		default:
			b.WriteString(fmt.Sprintf("%%%02X", c))
		}
	}

	return b.String()
}

// signingKey derives the date/region/service-scoped key.
func signingKey(secret, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), dateStamp)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	return hmacSHA256(kService, "aws4_request")
}

// presignOptions is everything a signature depends on.
type presignOptions struct {
	Method    string
	Host      string
	Path      string
	Region    string
	Query     url.Values
	Headers   map[string]string
	ExpiresIn int
	Now       time.Time
}

// presign returns a fully signed URL.
//
// Every signed header must also be sent by the client, which is why the caller
// gets `requiredHeaders` back rather than being expected to guess.
func (c *Config) presign(opts presignOptions) string {
	now := opts.Now.UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")

	credentialScope := strings.Join(
		[]string{dateStamp, opts.Region, "s3", "aws4_request"}, "/",
	)

	// Signed headers must be lowercase and sorted; the canonical form is what
	// is hashed, not what is sent.
	signedHeaderNames := make([]string, 0, len(opts.Headers)+1)
	canonicalHeaders := map[string]string{"host": opts.Host}
	signedHeaderNames = append(signedHeaderNames, "host")

	for name, value := range opts.Headers {
		lower := strings.ToLower(name)
		canonicalHeaders[lower] = strings.TrimSpace(value)
		signedHeaderNames = append(signedHeaderNames, lower)
	}
	sort.Strings(signedHeaderNames)

	query := url.Values{}
	for key, values := range opts.Query {
		query[key] = values
	}
	query.Set("X-Amz-Algorithm", algorithm)
	query.Set("X-Amz-Credential", c.AccessKeyID+"/"+credentialScope)
	query.Set("X-Amz-Date", amzDate)
	query.Set("X-Amz-Expires", fmt.Sprintf("%d", opts.ExpiresIn))
	query.Set("X-Amz-SignedHeaders", strings.Join(signedHeaderNames, ";"))

	// Temporary credentials carry a third part, and omitting it makes every
	// STS-issued credential fail with a signature error that names the
	// signature rather than the missing token.
	if c.SessionToken != "" {
		query.Set("X-Amz-Security-Token", c.SessionToken)
	}

	// The canonical query string is sorted by encoded key, with encoded values.
	keys := make([]string, 0, len(query))
	for key := range query {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, uriEncode(key, true)+"="+uriEncode(query.Get(key), true))
	}
	canonicalQuery := strings.Join(pairs, "&")

	headerLines := make([]string, 0, len(signedHeaderNames))
	for _, name := range signedHeaderNames {
		headerLines = append(headerLines, name+":"+canonicalHeaders[name]+"\n")
	}

	canonicalRequest := strings.Join([]string{
		opts.Method,
		uriEncode(opts.Path, false),
		canonicalQuery,
		strings.Join(headerLines, ""),
		strings.Join(signedHeaderNames, ";"),
		unsignedPayload,
	}, "\n")

	stringToSign := strings.Join([]string{
		algorithm,
		amzDate,
		credentialScope,
		sha256Hex(canonicalRequest),
	}, "\n")

	signature := hex.EncodeToString(
		hmacSHA256(signingKey(c.SecretAccessKey, dateStamp, opts.Region, "s3"), stringToSign),
	)

	return "https://" + opts.Host + uriEncode(opts.Path, false) +
		"?" + canonicalQuery + "&X-Amz-Signature=" + signature
}
