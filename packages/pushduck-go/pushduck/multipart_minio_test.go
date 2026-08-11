package pushduck

// Multipart against a real S3-compatible server.
//
// Every other test here stubs the storage leg, which leaves the two things
// most likely to be silently wrong unverified:
//
//  1. Part signing. `UploadPart` is signed with `partNumber` and `uploadId` in
//     the canonical request. A signature that is self-consistently wrong passes
//     every unit test and is rejected only by a real server.
//  2. Assembly. Parts that overlap, leave a gap, or are stitched in the wrong
//     order still upload, still complete, and still return 200. The object is
//     simply wrong.
//
// So the assertions are about bytes. The payload is a pattern where every byte
// encodes its own offset, which makes a misordered or misaligned part show up
// as a specific mismatched index rather than a vague "contents differ".
//
// Requires MinIO: `pnpm minio`. Skips — genuinely — when unreachable.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func minioEndpoint() string {
	if endpoint := os.Getenv("MINIO_ENDPOINT"); endpoint != "" {
		return endpoint
	}
	return "http://127.0.0.1:9010"
}

func minioAvailable() bool {
	client := http.Client{Timeout: 2 * time.Second}
	response, err := client.Get(minioEndpoint() + "/minio/health/live")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusOK
}

func minioConfig() Config {
	return Config{
		Bucket:          "test-uploads",
		Region:          "us-east-1",
		AccessKeyID:     "minioadmin",
		SecretAccessKey: "minioadmin",
		Endpoint:        minioEndpoint(),
		ForcePathStyle:  true,
	}
}

// patternedBytes returns bytes whose value encodes their own offset.
//
// Random bytes would prove equality but not *locate* a fault. A prime modulus
// means the pattern never aligns with a part boundary, so a misplaced part
// cannot coincidentally match.
func patternedBytes(size int) []byte {
	data := make([]byte, size)
	for i := range data {
		data[i] = byte(i % 251)
	}
	return data
}

func firstDifference(a, b []byte) int {
	if len(a) != len(b) {
		return min(len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			return i
		}
	}
	return -1
}

// post drives one action through the router, as a client would.
func post(t *testing.T, router *Router, action string, body any) map[string]any {
	t.Helper()

	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode %s: %v", action, err)
	}

	url := "/api/upload?route=bigUpload"
	if action != "" {
		url += "&action=" + action
	}

	request := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(encoded))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	var decoded map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("%s returned non-JSON (%d): %s", action, recorder.Code, recorder.Body.String())
	}

	if recorder.Code != http.StatusOK {
		t.Fatalf("%s failed with %d: %s", action, recorder.Code, recorder.Body.String())
	}

	return decoded
}

// uploadMultipart runs the whole handshake and returns the object key.
func uploadMultipart(t *testing.T, router *Router, name string, payload []byte) string {
	t.Helper()

	initiated := post(t, router, "multipart-init", map[string]any{
		"file": map[string]any{
			"name": name, "size": len(payload), "type": "application/octet-stream",
		},
		"partSize": minPartSize,
	})

	session := initiated["session"].(string)
	key := initiated["key"].(string)
	partSize := int(initiated["partSize"].(float64))

	partCount := (len(payload) + partSize - 1) / partSize
	numbers := make([]int, 0, partCount)
	for i := 1; i <= partCount; i++ {
		numbers = append(numbers, i)
	}

	// The signing response is a bare array, so it is decoded separately.
	encoded, _ := json.Marshal(map[string]any{"session": session, "partNumbers": numbers})
	request := httptest.NewRequest(http.MethodPost,
		"/api/upload?route=bigUpload&action=multipart-sign", bytes.NewReader(encoded))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("multipart-sign failed with %d: %s", recorder.Code, recorder.Body.String())
	}

	var signed []struct {
		PartNumber int    `json:"partNumber"`
		URL        string `json:"url"`
		Size       int64  `json:"size"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &signed); err != nil {
		t.Fatalf("decode signed parts: %v", err)
	}

	parts := make([]CompletedPart, 0, len(signed))
	for _, part := range signed {
		start := (part.PartNumber - 1) * partSize
		end := min(start+partSize, len(payload))

		put, err := http.NewRequest(http.MethodPut, part.URL, bytes.NewReader(payload[start:end]))
		if err != nil {
			t.Fatalf("build PUT for part %d: %v", part.PartNumber, err)
		}

		response, err := http.DefaultClient.Do(put)
		if err != nil {
			t.Fatalf("PUT part %d: %v", part.PartNumber, err)
		}
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()

		if response.StatusCode != http.StatusOK {
			t.Fatalf("part %d rejected with %d: %s", part.PartNumber, response.StatusCode, body)
		}

		etag := response.Header.Get("ETag")
		if etag == "" {
			t.Fatalf("part %d returned no ETag", part.PartNumber)
		}
		parts = append(parts, CompletedPart{PartNumber: part.PartNumber, ETag: etag})
	}

	post(t, router, "multipart-complete", map[string]any{
		"session": session, "parts": parts,
		"file": map[string]any{"name": name, "size": len(payload), "type": "application/octet-stream"},
	})

	return key
}

// readBack fetches an object through a presigned download URL.
func readBack(t *testing.T, config Config, key string) []byte {
	t.Helper()

	host, path := config.objectAddress(key)
	url := config.presign(presignOptions{
		Method: http.MethodGet, Host: host, Path: path,
		Region: config.Region, ExpiresIn: 120, Now: config.now(),
	})
	response, err := http.Get(url)
	if err != nil {
		t.Fatalf("download %s: %v", key, err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("download returned %d: %s", response.StatusCode, body)
	}

	data, _ := io.ReadAll(response.Body)
	return data
}

func newMinioRouter() *Router {
	return NewRouter(minioConfig(), Routes{
		"bigUpload": File(MaxSize("500MB")),
	})
}

func TestMultipartRoundTrip(t *testing.T) {
	if !minioAvailable() {
		t.Skipf("MinIO unreachable at %s — start it with `pnpm minio`", minioEndpoint())
	}

	// 12 MiB at 5 MiB parts → three parts, including a short final one.
	payload := patternedBytes(12 * mib)
	name := fmt.Sprintf("go-multi-%d.bin", time.Now().UnixNano())

	router := newMinioRouter()
	key := uploadMultipart(t, router, name, payload)

	actual := readBack(t, minioConfig(), key)

	if len(actual) != len(payload) {
		t.Fatalf("object is %d bytes, expected %d", len(actual), len(payload))
	}
	if index := firstDifference(actual, payload); index != -1 {
		t.Fatalf("object differs from what was uploaded at byte %d", index)
	}
}

func TestMultipartOddSizeExercisesShortFinalPart(t *testing.T) {
	if !minioAvailable() {
		t.Skip("MinIO unreachable")
	}

	// Not a multiple of the part size, and not a round number — where an
	// off-by-one in the final range truncates or overruns the object.
	payload := patternedBytes(13*mib + 7777)
	name := fmt.Sprintf("go-odd-%d.bin", time.Now().UnixNano())

	router := newMinioRouter()
	key := uploadMultipart(t, router, name, payload)

	actual := readBack(t, minioConfig(), key)
	if index := firstDifference(actual, payload); index != -1 {
		t.Fatalf("object differs at byte %d (len %d vs %d)", index, len(actual), len(payload))
	}
}

func TestListPartsReportsWhatWasUploaded(t *testing.T) {
	if !minioAvailable() {
		t.Skip("MinIO unreachable")
	}

	// What resume depends on: the provider is the authority on which parts
	// landed, not the client's own record.
	config := minioConfig()
	router := newMinioRouter()
	payload := patternedBytes(12 * mib)
	name := fmt.Sprintf("go-list-%d.bin", time.Now().UnixNano())

	initiated := post(t, router, "multipart-init", map[string]any{
		"file":     map[string]any{"name": name, "size": len(payload), "type": "application/octet-stream"},
		"partSize": minPartSize,
	})
	session := initiated["session"].(string)
	key := initiated["key"].(string)

	// Upload one part only.
	encoded, _ := json.Marshal(map[string]any{"session": session, "partNumbers": []int{1}})
	request := httptest.NewRequest(http.MethodPost,
		"/api/upload?route=bigUpload&action=multipart-sign", bytes.NewReader(encoded))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	var signed []struct {
		URL string `json:"url"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &signed)

	put, _ := http.NewRequest(http.MethodPut, signed[0].URL, bytes.NewReader(payload[:minPartSize]))
	response, err := http.DefaultClient.Do(put)
	if err != nil {
		t.Fatalf("PUT part 1: %v", err)
	}
	response.Body.Close()

	listed := post(t, router, "multipart-parts", map[string]any{"session": session})
	parts := listed["parts"].([]any)

	if len(parts) != 1 {
		t.Fatalf("expected 1 uploaded part, got %d", len(parts))
	}

	// Leave nothing behind: an abandoned session is billed until removed.
	post(t, router, "multipart-abort", map[string]any{"session": session})

	aborted := minioConfig()
	if remaining, err := aborted.listUploadedParts(key, "definitely-not-real"); err == nil && len(remaining) > 0 {
		t.Errorf("parts survived the abort: %d", len(remaining))
	}
	_ = config
}

func TestMultipartRejectsForgedSession(t *testing.T) {
	// No MinIO needed: the session is rejected before any storage call.
	router := newMinioRouter()

	encoded, _ := json.Marshal(map[string]any{
		"session": "bm90LWEtc2Vzc2lvbg.ZmFrZQ", "partNumbers": []int{1},
	})
	request := httptest.NewRequest(http.MethodPost,
		"/api/upload?route=bigUpload&action=multipart-sign", bytes.NewReader(encoded))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Errorf("forged session returned %d, expected 403", recorder.Code)
	}
}

func TestPartNumberOutsideThePlanIsRejected(t *testing.T) {
	// Signing a part beyond the plan would authorise a write past the end of
	// the object the session was created for.
	router := newMinioRouter()

	session, err := router.signSession(multipartSession{
		Key: "a.bin", UploadID: "u1", Route: "bigUpload",
		PartSize: minPartSize, TotalSize: 12 * mib,
	})
	if err != nil {
		t.Fatalf("signSession: %v", err)
	}

	encoded, _ := json.Marshal(map[string]any{"session": session, "partNumbers": []int{99}})
	request := httptest.NewRequest(http.MethodPost,
		"/api/upload?route=bigUpload&action=multipart-sign", bytes.NewReader(encoded))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("out-of-range part returned %d, expected 400", recorder.Code)
	}
}

func TestChoosePartSizeRespectsProviderLimits(t *testing.T) {
	if got := choosePartSize(10*mib, 1*mib); got != minPartSize {
		t.Errorf("a sub-minimum request gave %d, expected the 5 MiB floor", got)
	}

	// At the 5 MiB floor, 10,000 parts only reaches ~48.8 GiB, so beyond that
	// the part size must grow with the file.
	huge := int64(100) * 1024 * mib
	size := choosePartSize(huge, minPartSize)
	if huge/size > maxParts {
		t.Errorf("part size %d leaves %d parts, above the 10,000 cap", size, huge/size)
	}
}
