package pushduck

// The provider-side multipart operations.
//
// S3's multipart API is XML, and the responses are small and fixed, so they are
// parsed with `encoding/xml` rather than by pulling in the AWS SDK for four
// calls. The TypeScript implementation hand-rolls the same four for the same
// reason.
//
// Three things here are not obvious from the API documentation and were learnt
// the expensive way in the TypeScript implementation. They are reproduced
// rather than rediscovered:
//
//   - S3 can return an error document with HTTP 200. `CompleteMultipartUpload`
//     streams its response, so it commits to a status before it knows whether
//     the operation succeeded. A client that only checks the status treats a
//     failure as success.
//   - `ListParts` is paginated, and a truncated listing looks exactly like a
//     complete one.
//   - Aborting an upload that is already gone returns 404, which is the
//     desired end state rather than an error.

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

// CompletedPart is a part the provider has accepted.
type CompletedPart struct {
	PartNumber int    `json:"partNumber"`
	ETag       string `json:"etag"`
}

type initiateResult struct {
	XMLName  xml.Name `xml:"InitiateMultipartUploadResult"`
	UploadID string   `xml:"UploadId"`
	Key      string   `xml:"Key"`
}

type listPartsResult struct {
	XMLName     xml.Name `xml:"ListPartsResult"`
	IsTruncated bool     `xml:"IsTruncated"`
	Parts       []struct {
		PartNumber int    `xml:"PartNumber"`
		ETag       string `xml:"ETag"`
		Size       int64  `xml:"Size"`
	} `xml:"Part"`
	NextPartNumberMarker string `xml:"NextPartNumberMarker"`
}

type s3Error struct {
	XMLName xml.Name `xml:"Error"`
	Code    string   `xml:"Code"`
	Message string   `xml:"Message"`
}

// signedRequest signs and performs one S3 API call.
//
// Unlike an upload URL, these are made by the server, so the signature travels
// in the query string of a request this process issues rather than one it hands
// to a browser.
func (c *Config) signedRequest(
	method, key string, query url.Values, body []byte, headers map[string]string,
) (*http.Response, error) {
	host, path := c.objectAddress(key)

	signed := c.presign(presignOptions{
		Method:    method,
		Host:      host,
		Path:      path,
		Region:    c.Region,
		Query:     query,
		Headers:   headers,
		ExpiresIn: 900,
		Now:       c.now(),
	})

	request, err := http.NewRequest(method, signed, bytes.NewReader(body))
	if err != nil {
		return nil, NewError("INTERNAL_ERROR", "Could not build storage request")
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, NewError("STORAGE_UNAVAILABLE", "Could not reach storage")
	}

	return response, nil
}

// readStorageResponse returns the body, converting a provider error — however
// it is signalled — into a typed error.
func readStorageResponse(response *http.Response, operation string) ([]byte, error) {
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, NewError("STORAGE_UNAVAILABLE", "Could not read storage response")
	}

	// An error document can arrive with a 200, so the body is inspected
	// regardless of status.
	if bytes.Contains(body, []byte("<Error")) {
		var failure s3Error
		if xml.Unmarshal(body, &failure) == nil && failure.Code != "" {
			return nil, providerError(operation, failure.Code, failure.Message)
		}
	}

	if response.StatusCode >= 400 {
		return nil, providerError(
			operation,
			fmt.Sprintf("HTTP%d", response.StatusCode),
			strings.TrimSpace(string(body)),
		)
	}

	return body, nil
}

// providerError maps a provider code to a protocol code.
//
// The provider's own code is kept in the message because it is what a
// developer searches for; the protocol code is what a client branches on.
func providerError(operation, code, message string) *Error {
	switch code {
	case "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch":
		return NewError("STORAGE_ACCESS_DENIED",
			fmt.Sprintf("%s denied by storage (%s): %s", operation, code, message))
	case "NoSuchUpload":
		return NewError("NOT_FOUND",
			fmt.Sprintf("%s failed: the multipart session no longer exists", operation))
	case "EntityTooSmall", "InvalidPart", "InvalidPartOrder":
		return NewError("BAD_REQUEST",
			fmt.Sprintf("%s rejected (%s): %s", operation, code, message))
	default:
		return NewError("STORAGE_UNAVAILABLE",
			fmt.Sprintf("%s failed (%s): %s", operation, code, message))
	}
}

// createMultipartUpload starts a session and returns the provider's upload id.
func (c *Config) createMultipartUpload(key, contentType string) (string, error) {
	headers := map[string]string{"x-amz-acl": "private"}
	if contentType != "" {
		headers["content-type"] = contentType
	}

	query := url.Values{}
	query.Set("uploads", "")

	response, err := c.signedRequest(http.MethodPost, key, query, nil, headers)
	if err != nil {
		return "", err
	}

	body, err := readStorageResponse(response, "CreateMultipartUpload")
	if err != nil {
		return "", err
	}

	var result initiateResult
	if err := xml.Unmarshal(body, &result); err != nil || result.UploadID == "" {
		return "", NewError("STORAGE_UNAVAILABLE",
			"CreateMultipartUpload returned no upload id")
	}

	return result.UploadID, nil
}

// presignUploadPart returns a URL the browser can PUT one part to.
//
// `partNumber` and `uploadId` must be in the canonical request *before*
// signing, not appended afterwards, or the signature covers a different URL
// than the one used.
func (c *Config) presignUploadPart(key, uploadID string, partNumber int) string {
	host, path := c.objectAddress(key)

	query := url.Values{}
	query.Set("partNumber", strconv.Itoa(partNumber))
	query.Set("uploadId", uploadID)

	signed := c.presign(presignOptions{
		Method:    http.MethodPut,
		Host:      host,
		Path:      path,
		Region:    c.Region,
		Query:     query,
		ExpiresIn: c.uploadExpiry(),
		Now:       c.now(),
	})

	return signed
}

// completeMultipartUpload stitches the parts into an object.
func (c *Config) completeMultipartUpload(key, uploadID string, parts []CompletedPart) error {
	// Providers reject an unordered list, and the client is not required to
	// send them in order.
	ordered := make([]CompletedPart, len(parts))
	copy(ordered, parts)
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].PartNumber < ordered[j].PartNumber
	})

	var document strings.Builder
	document.WriteString("<CompleteMultipartUpload>")
	for _, part := range ordered {
		// The ETag is echoed exactly as the provider gave it, quotes included:
		// stripping them produces `InvalidPart` after every byte has already
		// been transferred.
		document.WriteString(fmt.Sprintf(
			"<Part><PartNumber>%d</PartNumber><ETag>%s</ETag></Part>",
			part.PartNumber, escapeXML(part.ETag),
		))
	}
	document.WriteString("</CompleteMultipartUpload>")

	query := url.Values{}
	query.Set("uploadId", uploadID)

	response, err := c.signedRequest(
		http.MethodPost, key, query, []byte(document.String()),
		map[string]string{"content-type": "application/xml"},
	)
	if err != nil {
		return err
	}

	_, err = readStorageResponse(response, "CompleteMultipartUpload")
	return err
}

// abortMultipartUpload discards a session and its parts.
func (c *Config) abortMultipartUpload(key, uploadID string) error {
	query := url.Values{}
	query.Set("uploadId", uploadID)

	response, err := c.signedRequest(http.MethodDelete, key, query, nil, nil)
	if err != nil {
		return err
	}

	// Already gone is the desired end state, not a failure.
	if response.StatusCode == http.StatusNotFound {
		response.Body.Close()
		return nil
	}

	_, err = readStorageResponse(response, "AbortMultipartUpload")
	return err
}

// listUploadedParts reports which parts the provider actually holds.
//
// This is what makes resume possible: the client's own record of what landed
// is a hint, and the provider is the authority.
func (c *Config) listUploadedParts(key, uploadID string) ([]CompletedPart, error) {
	parts := []CompletedPart{}
	marker := ""

	for {
		query := url.Values{}
		query.Set("uploadId", uploadID)
		if marker != "" {
			query.Set("part-number-marker", marker)
		}

		response, err := c.signedRequest(http.MethodGet, key, query, nil, nil)
		if err != nil {
			return nil, err
		}

		body, err := readStorageResponse(response, "ListParts")
		if err != nil {
			return nil, err
		}

		var result listPartsResult
		if err := xml.Unmarshal(body, &result); err != nil {
			return nil, NewError("STORAGE_UNAVAILABLE", "ListParts returned malformed XML")
		}

		for _, part := range result.Parts {
			// A part with no ETag cannot be completed with, so including it
			// would produce `InvalidPart` much later.
			if part.ETag == "" {
				continue
			}
			parts = append(parts, CompletedPart{PartNumber: part.PartNumber, ETag: part.ETag})
		}

		// A truncated listing is indistinguishable from a complete one unless
		// this flag is honoured, and stopping early makes resume re-upload
		// parts the provider already has.
		if !result.IsTruncated || result.NextPartNumberMarker == "" {
			return parts, nil
		}
		marker = result.NextPartNumberMarker
	}
}

func escapeXML(value string) string {
	var buffer bytes.Buffer
	_ = xml.EscapeText(&buffer, []byte(value))
	return buffer.String()
}
