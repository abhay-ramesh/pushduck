package pushduck

// A completion names its own key, so tolerating an absent token let anyone who
// could reach the endpoint assert that an arbitrary object had been uploaded —
// and fire OnComplete for a key they never touched. The Go server returns an
// unsigned URL, so it never leaked a signature the way the TypeScript one did,
// but the hook is the more consequential half: it is where applications insert
// the row and grant access.

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func completionRouter(t *testing.T, options ...RouteOption) (*Router, *int) {
	t.Helper()

	fired := 0
	options = append(options, OnComplete(func(*http.Request, string, FileMeta, map[string]any) error {
		fired++
		return nil
	}))

	router := NewRouter(
		Config{
			Bucket:          "test-bucket",
			Region:          "us-east-1",
			AccessKeyID:     "test-key",
			SecretAccessKey: "test-secret",
		},
		Routes{"imageUpload": NewRoute(options...)},
	)

	return router, &fired
}

func postAction(t *testing.T, router *Router, action string, body any) *httptest.ResponseRecorder {
	t.Helper()

	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/upload?route=imageUpload&action="+action,
		bytes.NewReader(encoded),
	)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

var completionFile = FileMeta{Name: "photo.jpg", Size: 1024, Type: "image/jpeg"}

func TestUntokenedCompletionIsRefusedByDefault(t *testing.T) {
	router, fired := completionRouter(t)

	response := postAction(t, router, "complete", map[string]any{
		"completions": []map[string]any{
			{"key": "private/other-tenant/tax.pdf", "file": completionFile, "metadata": map[string]any{}},
		},
	})

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for an untokened completion, got %d: %s", response.Code, response.Body)
	}
	if *fired != 0 {
		t.Fatalf("OnComplete ran %d times for a key that was never presigned", *fired)
	}
}

func TestPresignedCompletionIsAccepted(t *testing.T) {
	router, fired := completionRouter(t)

	issue := postAction(t, router, "presign", map[string]any{"files": []FileMeta{completionFile}})
	if issue.Code != http.StatusOK {
		t.Fatalf("presign failed: %d %s", issue.Code, issue.Body)
	}

	var presigned struct {
		Results []struct {
			Key             string `json:"key"`
			CompletionToken string `json:"completionToken"`
		} `json:"results"`
	}
	if err := json.Unmarshal(issue.Body.Bytes(), &presigned); err != nil {
		t.Fatalf("decode presign: %v", err)
	}

	response := postAction(t, router, "complete", map[string]any{
		"completions": []map[string]any{{
			"key":             presigned.Results[0].Key,
			"completionToken": presigned.Results[0].CompletionToken,
			"file":            completionFile,
			"metadata":        map[string]any{},
		}},
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for a presigned completion, got %d: %s", response.Code, response.Body)
	}
	if *fired != 1 {
		t.Fatalf("OnComplete ran %d times, want 1", *fired)
	}
}

func TestDeploymentsCanOptOutForOlderClients(t *testing.T) {
	router, fired := completionRouter(t, AllowUntokenedCompletion())

	response := postAction(t, router, "complete", map[string]any{
		"completions": []map[string]any{
			{"key": "uploads/photo.jpg", "file": completionFile, "metadata": map[string]any{}},
		},
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 when the route opts out, got %d: %s", response.Code, response.Body)
	}
	if *fired != 1 {
		t.Fatalf("OnComplete ran %d times, want 1", *fired)
	}
}
