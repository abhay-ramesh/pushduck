package pushduck

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// postTo drives one action on one route through the router, as a client would.
func postTo(t *testing.T, router *Router, route, action string, body any, headers ...string) *httptest.ResponseRecorder {
	t.Helper()

	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/upload?route="+route+"&action="+action,
		bytes.NewReader(encoded),
	)
	for i := 0; i+1 < len(headers); i += 2 {
		request.Header.Set(headers[i], headers[i+1])
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func decode(t *testing.T, response *httptest.ResponseRecorder, into any) {
	t.Helper()

	if err := json.Unmarshal(response.Body.Bytes(), into); err != nil {
		t.Fatalf("decode %d response: %v\n%s", response.Code, err, response.Body.String())
	}
}
