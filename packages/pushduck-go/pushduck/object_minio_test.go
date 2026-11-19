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

func TestPresignedPutRefusesAnyLengthButTheDeclaredOne(t *testing.T) {
	if !minioAvailable() {
		t.Skip("MinIO unreachable")
	}

	// MaxSize is checked against the declared size; signing that size is what
	// makes it hold for the bytes that arrive.
	router := NewRouter(minioConfig(), Routes{"docUpload": File(MaxSize("1MB"))})
	name := fmt.Sprintf("go-sized-%d.txt", time.Now().UnixNano())

	url, headers, _ := presignOne(t, router, "docUpload", FileMeta{Name: name, Size: 5, Type: "text/plain"})

	if strings.Contains(strings.ToLower(fmt.Sprint(headers)), "content-length") {
		t.Errorf("content-length handed to the client, which a browser cannot set: %v", headers)
	}
	if !strings.Contains(url, "content-length") {
		t.Errorf("content-length is not among the signed headers: %s", url)
	}

	for body, want := range map[string]int{
		"hello, and then some": http.StatusForbidden,
		"hi":                   http.StatusForbidden,
		"hello":                http.StatusOK,
	} {
		if got := putTo(t, url, headers, body); got != want {
			t.Errorf("PUT %q = %d, want %d", body, got, want)
		}
	}
}

func TestAPartURLRefusesAnyLengthButThePartsOwn(t *testing.T) {
	if !minioAvailable() {
		t.Skip("MinIO unreachable")
	}

	// Each part URL signs the part's size, so a client cannot push more bytes
	// through a part than the declared file size accounts for.
	router := NewRouter(minioConfig(), Routes{"bigUpload": File(MaxSize("50MB"))})
	file := FileMeta{Name: fmt.Sprintf("go-part-%d.bin", time.Now().UnixNano()), Size: 5*mib + 10, Type: "application/octet-stream"}

	init := postTo(t, router, "bigUpload", "multipart-init", map[string]any{"file": file})
	var started struct {
		Session string `json:"session"`
	}
	decode(t, init, &started)

	sign := postTo(t, router, "bigUpload", "multipart-sign", map[string]any{
		"session": started.Session, "partNumbers": []int{1, 2},
	})
	var parts []struct {
		URL  string `json:"url"`
		Size int64  `json:"size"`
	}
	decode(t, sign, &parts)
	last := parts[1]
	if last.Size != 10 {
		t.Fatalf("last part size = %d, want 10", last.Size)
	}

	if status := putTo(t, last.URL, nil, strings.Repeat("x", 5*mib)); status != http.StatusForbidden {
		t.Errorf("oversized part = %d, want 403", status)
	}
	if status := putTo(t, last.URL, nil, strings.Repeat("x", 10)); status != http.StatusOK {
		t.Errorf("exact part = %d, want 200", status)
	}

	postTo(t, router, "bigUpload", "multipart-abort", map[string]any{"session": started.Session})
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

func TestCompletionVerifiesTheObjectAgainstMinIO(t *testing.T) {
	if !minioAvailable() {
		t.Skip("MinIO unreachable")
	}

	var completed []Upload
	router := NewRouter(minioConfig(), Routes{"docUpload": File(
		MaxSize("1MB"),
		OnComplete(func(_ *http.Request, done Upload) error {
			completed = append(completed, done)
			return nil
		}),
	)})
	file := FileMeta{Name: fmt.Sprintf("go-verify-%d.txt", time.Now().UnixNano()), Size: 5, Type: "text/plain"}

	response := postTo(t, router, "docUpload", "presign", map[string]any{"files": []FileMeta{file}})
	var issued struct {
		Results []struct {
			Key             string            `json:"key"`
			CompletionToken string            `json:"completionToken"`
			PresignedURL    string            `json:"presignedUrl"`
			RequiredHeaders map[string]string `json:"requiredHeaders"`
		} `json:"results"`
	}
	decode(t, response, &issued)
	result := issued.Results[0]

	complete := func() completionEntry {
		done := postTo(t, router, "docUpload", "complete", map[string]any{
			"completions": []map[string]any{{
				"key": result.Key, "file": file, "completionToken": result.CompletionToken,
			}},
		})
		var body struct {
			Results []completionEntry `json:"results"`
		}
		decode(t, done, &body)
		return body.Results[0]
	}

	if early := complete(); early.Success || early.Code != "NOT_FOUND" {
		t.Fatalf("completion before upload = %+v, want NOT_FOUND", early)
	}

	if status := putTo(t, result.PresignedURL, result.RequiredHeaders, "hello"); status != http.StatusOK {
		t.Fatalf("PUT = %d", status)
	}

	if done := complete(); !done.Success || len(completed) != 1 ||
		completed[0].Object.Size != 5 || completed[0].Object.ContentType != "text/plain" {
		t.Fatalf("completion = %+v, hook saw %+v", done, completed)
	}
}
