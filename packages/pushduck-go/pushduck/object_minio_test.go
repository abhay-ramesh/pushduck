package pushduck

// Single-object storage operations against a real S3-compatible server.
//
// Requires MinIO: `pnpm minio`. Skips when unreachable.

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"
)

// presignOne presigns one file on a route over MinIO and returns the URL and
// the headers the client must send.
func presignOne(t *testing.T, router *Router, route string, file FileMeta) (string, map[string]string, string) {
	t.Helper()

	response := postTo(t, router, route, "presign", map[string]any{"files": []FileMeta{file}})
	if response.Code != http.StatusOK {
		t.Fatalf("presign = %d: %s", response.Code, response.Body.String())
	}

	var body struct {
		Results []struct {
			PresignedURL    string            `json:"presignedUrl"`
			RequiredHeaders map[string]string `json:"requiredHeaders"`
			Key             string            `json:"key"`
		} `json:"results"`
	}
	decode(t, response, &body)
	result := body.Results[0]
	return result.PresignedURL, result.RequiredHeaders, result.Key
}

// putTo sends a body to a presigned URL the way a browser would.
func putTo(t *testing.T, url string, headers map[string]string, body string) int {
	t.Helper()

	request, err := http.NewRequest(http.MethodPut, url, strings.NewReader(body))
	if err != nil {
		t.Fatalf("build PUT: %v", err)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("PUT: %v", err)
	}
	response.Body.Close()
	return response.StatusCode
}

func TestHeadObjectReportsWhatWasStored(t *testing.T) {
	if !minioAvailable() {
		t.Skip("MinIO unreachable")
	}

	config := minioConfig()
	router := NewRouter(config, Routes{"docUpload": File()})
	name := fmt.Sprintf("go-head-%d.txt", time.Now().UnixNano())

	url, headers, key := presignOne(t, router, "docUpload", FileMeta{Name: name, Size: 5, Type: "text/plain"})

	missing, err := config.headObject(key)
	if err != nil || missing != nil {
		t.Fatalf("head before upload = %+v, %v; want nil, nil", missing, err)
	}

	if status := putTo(t, url, headers, "hello"); status != http.StatusOK {
		t.Fatalf("PUT = %d", status)
	}

	info, err := config.headObject(key)
	if err != nil || info == nil {
		t.Fatalf("head after upload = %+v, %v", info, err)
	}
	if info.Size != 5 || info.ContentType != "text/plain" {
		t.Errorf("observed %d bytes of %q, want 5 of text/plain", info.Size, info.ContentType)
	}
	if info.ETag == "" || strings.Contains(info.ETag, `"`) {
		t.Errorf("etag = %q, want an unquoted value", info.ETag)
	}
	if info.LastModified.IsZero() {
		t.Error("last-modified missing")
	}

	if err := config.deleteObject(key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if gone, err := config.headObject(key); err != nil || gone != nil {
		t.Errorf("head after delete = %+v, %v", gone, err)
	}
	if err := config.deleteObject(key); err != nil {
		t.Errorf("deleting an absent object is the desired end state, got %v", err)
	}
}

func TestHeadObjectReportsRefusedCredentials(t *testing.T) {
	if !minioAvailable() {
		t.Skip("MinIO unreachable")
	}

	// A 403 must not read as "no object": completion would then refuse every
	// upload as never having arrived, with the real cause invisible.
	config := minioConfig()
	config.SecretAccessKey = "not-the-secret"

	_, err := config.headObject("anything.txt")
	if err == nil || asError(err).Code != "STORAGE_ACCESS_DENIED" {
		t.Fatalf("head with a wrong secret = %v, want STORAGE_ACCESS_DENIED", err)
	}
}
