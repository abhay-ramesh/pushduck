package pushduck

// Key scoping.
//
// Without a StoragePath hook every key is the sanitised filename alone, so two
// users uploading `photo.jpg` write the same object — and the completion token
// issued for one user's `photo.jpg` also matches the other's, because the token
// binds key and route and nothing else. TypeScript scopes keys with
// `.paths()`, Python with `storage_path`; this is the Go equivalent, with the
// same chokepoint (`resolveKey`) as Python's `resolve_key`.

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// byUser scopes keys by an `X-User` header, standing in for whatever an
// application's real authentication returns.
func byUser(r *http.Request, file FileMeta) (string, error) {
	user := r.Header.Get("X-User")
	if user == "" {
		return "", NewError("UNAUTHORIZED", "Sign in to upload")
	}
	return "users/" + user + "/" + file.Name, nil
}

func fixedPath(fragment string) RouteOption {
	return WithStoragePath(func(*http.Request, FileMeta) (string, error) {
		return fragment, nil
	})
}

func postAs(t *testing.T, router *Router, user, action string, body any) *httptest.ResponseRecorder {
	t.Helper()

	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/upload?route=imageUpload&action="+action,
		strings.NewReader(string(encoded)),
	)
	if user != "" {
		request.Header.Set("X-User", user)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

type presigned struct {
	Key             string `json:"key"`
	CompletionToken string `json:"completionToken"`
	PresignedURL    string `json:"presignedUrl"`
}

func presignAs(t *testing.T, router *Router, user string, file FileMeta) presigned {
	t.Helper()

	response := postAs(t, router, user, "presign", map[string]any{"files": []FileMeta{file}})
	if response.Code != http.StatusOK {
		t.Fatalf("presign as %q = %d: %s", user, response.Code, response.Body.String())
	}

	var body struct {
		Results []presigned `json:"results"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || len(body.Results) != 1 {
		t.Fatalf("decode presign: %v %s", err, response.Body.String())
	}
	return body.Results[0]
}

func problemCode(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()

	var document struct {
		Code   string `json:"code"`
		Detail string `json:"detail"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &document); err != nil {
		t.Fatalf("decode problem: %v %s", err, response.Body.String())
	}
	return document.Code
}

// ─── default unchanged ──────────────────────────────────────────────────────

func TestDefaultKeyIsTheSanitisedFilename(t *testing.T) {
	router, _ := completionRouter(t)

	for _, name := range []string{"photo.jpg", "写真 photo.png", "../../etc/passwd", "a?b#c%d.png"} {
		file := FileMeta{Name: name, Size: 10, Type: "image/png"}
		got := presignAs(t, router, "", file)
		if want := generateKey(name); got.Key != want {
			t.Errorf("default key for %q = %q, want %q", name, got.Key, want)
		}
	}
}

// ─── scoping ────────────────────────────────────────────────────────────────

func TestStoragePathSeparatesUsers(t *testing.T) {
	router, fired := completionRouter(t, WithStoragePath(byUser))

	alice := presignAs(t, router, "alice", completionFile)
	bob := presignAs(t, router, "bob", completionFile)

	if alice.Key != "users/alice/photo.jpg" || bob.Key != "users/bob/photo.jpg" {
		t.Fatalf("keys = %q, %q", alice.Key, bob.Key)
	}
	if !strings.Contains(alice.PresignedURL, "/users/alice/photo.jpg?") {
		t.Errorf("presigned URL does not address the scoped key: %s", alice.PresignedURL)
	}

	// Alice's token completes Alice's key.
	ok := postAs(t, router, "alice", "complete", map[string]any{"completions": []map[string]any{{
		"key": alice.Key, "file": completionFile, "metadata": map[string]any{},
		"completionToken": alice.CompletionToken,
	}}})
	if ok.Code != http.StatusOK || *fired != 1 {
		t.Fatalf("own completion = %d (fired %d): %s", ok.Code, *fired, ok.Body.String())
	}

	// ...and does not complete Bob's, which under the default key it would.
	stolen := postAs(t, router, "alice", "complete", map[string]any{"completions": []map[string]any{{
		"key": bob.Key, "file": completionFile, "metadata": map[string]any{},
		"completionToken": alice.CompletionToken,
	}}})
	if stolen.Code != http.StatusForbidden {
		t.Fatalf("cross-user completion = %d, want 403: %s", stolen.Code, stolen.Body.String())
	}
	if *fired != 1 {
		t.Errorf("OnComplete fired for another user's key")
	}
}

func TestStoragePathErrorPropagates(t *testing.T) {
	router, _ := completionRouter(t, WithStoragePath(byUser))

	response := postAs(t, router, "", "presign", map[string]any{"files": []FileMeta{completionFile}})
	if response.Code != http.StatusUnauthorized || problemCode(t, response) != "UNAUTHORIZED" {
		t.Fatalf("typed hook error = %d: %s", response.Code, response.Body.String())
	}

	// A bare error is withheld, exactly as a metadata hook's is.
	router, _ = completionRouter(t, WithStoragePath(func(*http.Request, FileMeta) (string, error) {
		return "", errors.New("dial tcp 10.0.0.5:5432: secret detail")
	}))
	response = postAs(t, router, "", "presign", map[string]any{"files": []FileMeta{completionFile}})
	if response.Code != http.StatusInternalServerError || problemCode(t, response) != "INTERNAL_ERROR" {
		t.Fatalf("bare hook error = %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "secret detail") {
		t.Errorf("internal detail leaked: %s", response.Body.String())
	}
}

func TestStoragePathRunsOnlyForAcceptedFiles(t *testing.T) {
	calls := 0
	router, _ := completionRouter(t,
		AllowTypes("image/*"),
		WithStoragePath(func(_ *http.Request, f FileMeta) (string, error) {
			calls++
			return "t/" + f.Name, nil
		}),
	)

	response := postAs(t, router, "", "presign", map[string]any{"files": []FileMeta{
		{Name: "a.txt", Size: 10, Type: "text/plain"},
		completionFile,
	}})
	if response.Code != http.StatusOK || calls != 1 {
		t.Fatalf("status %d, hook calls %d: %s", response.Code, calls, response.Body.String())
	}
}

// ─── the chokepoint ─────────────────────────────────────────────────────────

func TestResolveKeyRejectsUnsafeFragments(t *testing.T) {
	cases := []struct {
		name, fragment string
	}{
		// The Python suite's cases, verbatim.
		{"traversal", "../../etc/passwd"},
		{"absolute", "/absolute/key.png"},
		{"embedded traversal", "a/../../../b.png"},
		{"empty segment", "tenant//double.png"},
		{"query", "with?query.png"},
		{"fragment", "with#fragment.png"},
		// And the rest of the rules.
		{"empty", ""},
		{"dot", "."},
		{"dot segment", "a/./b.png"},
		{"bare dotdot", ".."},
		{"leading traversal", "../x"},
		{"trailing slash", "tenant/"},
		{"percent", "a%2Fb.png"},
		{"nul", "a\x00b.png"},
		{"newline", "a\nb.png"},
		{"bidi override", "invoice\u202Egnp.exe"},
		{"zero width", "a\u200Bb.png"},
		{"byte order mark", "\uFEFFa.png"},
		{"invalid utf-8", "a\xffb.png"},
		{"overlong", strings.Repeat("a/", 600) + "b.png"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			key, err := resolveKey(tc.fragment)
			if err == nil {
				t.Fatalf("%q was accepted as %q", tc.fragment, key)
			}
			var typed *Error
			if !errors.As(err, &typed) || typed.Code != "CONFIG_INVALID" {
				t.Fatalf("%q: error %v, want CONFIG_INVALID", tc.fragment, err)
			}
			if !strings.Contains(typed.Message, "StoragePath hook") {
				t.Errorf("message does not name the hook: %s", typed.Message)
			}
		})
	}
}

func TestResolveKeyResanitisesEverySegment(t *testing.T) {
	cases := []struct {
		fragment, want string
	}{
		{"photo.jpg", "photo.jpg"},
		{"users/alice/photo.jpg", "users/alice/photo.jpg"},
		{"tenant/写真 photo.png", "tenant/" + generateKey("写真 photo.png")},
		{"tenant/文档.pdf", "tenant/文档.pdf"},
		{"Отчёт 2024/Отчёт.pdf", generateKey("Отчёт 2024") + "/Отчёт.pdf"},
		{"my tenant/a b.png", "my_tenant/a_b.png"},
		{"t/***.png", "t/" + generateKey("***.png")},
		{".hidden/x", ".hidden/x"},
	}

	for _, tc := range cases {
		got, err := resolveKey(tc.fragment)
		if err != nil {
			t.Errorf("%q rejected: %v", tc.fragment, err)
			continue
		}
		if got != tc.want {
			t.Errorf("resolveKey(%q) = %q, want %q", tc.fragment, got, tc.want)
		}
	}

	// Each segment is sanitised exactly as a default key would be.
	for _, name := range []string{"写真 photo.png", "Отчёт.pdf", "a  b__c.png", "***.png"} {
		got, _ := resolveKey("t/" + name)
		if got != "t/"+generateKey(name) {
			t.Errorf("segment %q sanitised to %q, default gives %q", name, got, generateKey(name))
		}
	}
}

func TestResolveKeyLimitIsOnBytesOfTheResult(t *testing.T) {
	// 1024 bytes exactly is legal; one more is not.
	// Segments stay under generateKey's own 900-byte truncation, so it is the
	// total that is measured here.
	exact := strings.Repeat("a", 500) + "/" + strings.Repeat("b", 500) + "/" + strings.Repeat("c", 22)
	if got, err := resolveKey(exact); err != nil || len(got) != 1024 {
		t.Fatalf("1024-byte key: %q, %v", got, err)
	}
	if _, err := resolveKey(exact + "g"); err == nil {
		t.Fatalf("1025-byte key accepted")
	}

	// A CJK character costs three bytes, so the limit trips well under 1024
	// characters.
	cjk := strings.Repeat("写/", 341) + "x" // 341*4 + 1 = 1365 bytes, 683 runes
	if _, err := resolveKey(cjk); err == nil {
		t.Fatalf("%d-byte CJK key accepted", len(cjk))
	}
}

func TestInvalidStoragePathFailsPresignWithConfigInvalid(t *testing.T) {
	router, _ := completionRouter(t, fixedPath("../escape.png"))

	response := postAs(t, router, "", "presign", map[string]any{"files": []FileMeta{completionFile}})
	if response.Code != http.StatusInternalServerError || problemCode(t, response) != "CONFIG_INVALID" {
		t.Fatalf("presign = %d: %s", response.Code, response.Body.String())
	}
}

// ─── multipart ──────────────────────────────────────────────────────────────

// fakeStorage answers CreateMultipartUpload and records the path it was asked
// to create, so multipart init is checked without MinIO.
func fakeStorage(t *testing.T) (Config, *[]string) {
	t.Helper()

	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.URL.Query()["uploads"]; !ok || r.Method != http.MethodPost {
			http.Error(w, "unexpected", http.StatusBadRequest)
			return
		}
		unescaped, _ := url.PathUnescape(r.URL.EscapedPath())
		paths = append(paths, unescaped)
		fmt.Fprint(w, `<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>`)
	}))
	t.Cleanup(server.Close)

	return Config{
		Bucket:          "test-bucket",
		Region:          "us-east-1",
		AccessKeyID:     "test-key",
		SecretAccessKey: "test-secret",
		Endpoint:        server.URL,
		ForcePathStyle:  true,
	}, &paths
}

func TestMultipartInitUsesTheScopedKey(t *testing.T) {
	config, paths := fakeStorage(t)
	router := NewRouter(config, Routes{"imageUpload": NewRoute(WithStoragePath(byUser))})

	file := FileMeta{Name: "写真 video.mp4", Size: 50 << 20, Type: "video/mp4"}
	response := postAs(t, router, "alice", "multipart-init", map[string]any{"file": file})
	if response.Code != http.StatusOK {
		t.Fatalf("init = %d: %s", response.Code, response.Body.String())
	}

	var body struct {
		Key     string `json:"key"`
		Session string `json:"session"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}

	want := "users/alice/" + generateKey(file.Name)
	if body.Key != want {
		t.Fatalf("multipart key = %q, want %q", body.Key, want)
	}
	if len(*paths) != 1 || (*paths)[0] != "/test-bucket/"+want {
		t.Fatalf("storage was asked to create %v", *paths)
	}

	// The session token binds the scoped key, not the bare filename.
	session, err := router.verifySession(body.Session)
	if err != nil || session.Key != want {
		t.Fatalf("session key = %q, %v", session.Key, err)
	}
}

func TestMultipartInitRejectsAnInvalidStoragePath(t *testing.T) {
	config, paths := fakeStorage(t)
	router := NewRouter(config, Routes{"imageUpload": NewRoute(fixedPath("a//b.mp4"))})

	file := FileMeta{Name: "video.mp4", Size: 50 << 20, Type: "video/mp4"}
	response := postAs(t, router, "", "multipart-init", map[string]any{"file": file})
	if response.Code != http.StatusInternalServerError || problemCode(t, response) != "CONFIG_INVALID" {
		t.Fatalf("init = %d: %s", response.Code, response.Body.String())
	}
	if len(*paths) != 0 {
		t.Errorf("a session was created at storage for a rejected key: %v", *paths)
	}
}
