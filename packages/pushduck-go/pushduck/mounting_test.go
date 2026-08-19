package pushduck

// The mountings the documentation claims.
//
// `http.Handler` is what net/http, chi and gorilla already speak, and gin and
// echo wrap it in one line. That claim is cheap to make and worth checking:
// the JavaScript package's docs advertised a call that threw, in five guides,
// for months.
//
// gin and echo are not imported here — adding two web frameworks as test
// dependencies to a package with none would cost more than it proves, and what
// they wrap is exactly the `http.Handler` exercised below.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func mountingRouter() *Router {
	return NewRouter(
		Config{
			Bucket:          "test-bucket",
			Region:          "us-east-1",
			AccessKeyID:     "test-key",
			SecretAccessKey: "test-secret",
		},
		Routes{
			"imageUpload": Image(
				MaxSize("5MB"),
				WithMiddleware(func(r *http.Request, _ FileMeta) (map[string]any, error) {
					if r.Header.Get("Authorization") != "Bearer token" {
						return nil, NewError("UNAUTHORIZED", "Sign in to upload")
					}
					return map[string]any{"userId": "u1"}, nil
				}),
			),
		},
	)
}

var presignBody = []byte(`{"files":[{"name":"photo.jpg","size":1000,"type":"image/jpeg"}]}`)

// assertPresigned holds every mounting to the same bar.
func assertPresigned(t *testing.T, recorder *httptest.ResponseRecorder) {
	t.Helper()

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var body struct {
		Results []struct {
			Success      bool           `json:"success"`
			PresignedURL string         `json:"presignedUrl"`
			Metadata     map[string]any `json:"metadata"`
		} `json:"results"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if len(body.Results) != 1 || !body.Results[0].Success {
		t.Fatalf("expected one successful result: %s", recorder.Body.String())
	}
	if !bytes.Contains([]byte(body.Results[0].PresignedURL), []byte("X-Amz-Signature")) {
		t.Error("presigned URL carries no signature")
	}
	// The middleware ran and its output is authoritative.
	if body.Results[0].Metadata["userId"] != "u1" {
		t.Errorf("middleware metadata missing: %v", body.Results[0].Metadata)
	}
}

// TestMountsOnServeMux is the documented net/http mounting.
func TestMountsOnServeMux(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("/api/upload", mountingRouter())

	request := httptest.NewRequest(http.MethodPost,
		"/api/upload?route=imageUpload", bytes.NewReader(presignBody))
	request.Header.Set("Authorization", "Bearer token")
	request.Header.Set("Content-Type", "application/json")

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	assertPresigned(t, recorder)
}

// TestWorksBehindMiddleware covers the chi and gorilla shape: an
// http.Handler wrapped by other http.Handlers.
func TestWorksBehindMiddleware(t *testing.T) {
	var sawRequest bool

	logging := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sawRequest = true
			next.ServeHTTP(w, r)
		})
	}

	handler := logging(mountingRouter())

	request := httptest.NewRequest(http.MethodPost,
		"/api/upload?route=imageUpload", bytes.NewReader(presignBody))
	request.Header.Set("Authorization", "Bearer token")

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertPresigned(t, recorder)
	if !sawRequest {
		t.Error("the wrapping middleware never ran")
	}
}

// TestMountsUnderAnyPath is the claim that makes one handler work across
// frameworks: it answers the request it is given and never consults its own
// mount path.
func TestMountsUnderAnyPath(t *testing.T) {
	router := mountingRouter()

	for _, path := range []string{"/api/upload", "/upload", "/v1/files", "/deeply/nested/endpoint"} {
		request := httptest.NewRequest(http.MethodPost,
			path+"?route=imageUpload", bytes.NewReader(presignBody))
		request.Header.Set("Authorization", "Bearer token")

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Errorf("mounting at %s failed with %d", path, recorder.Code)
		}
	}
}

// TestMiddlewareRejectionSurvivesTheMounting checks that a rejection keeps its
// own status rather than being flattened by the surrounding stack.
func TestMiddlewareRejectionSurvivesTheMounting(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("/api/upload", mountingRouter())

	request := httptest.NewRequest(http.MethodPost,
		"/api/upload?route=imageUpload", bytes.NewReader(presignBody))

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var problem struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &problem)
	if problem.Code != "UNAUTHORIZED" {
		t.Errorf("expected UNAUTHORIZED, got %q", problem.Code)
	}
}
