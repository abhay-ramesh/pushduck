package pushduck

// Completion accepts what was stored, not what was claimed.
//
// The browser chooses the Content-Type it sends, and a multipart part's length
// is not signed. So a route's MaxSize and AllowTypes, enforced at presign
// against the client's declaration, are only a promise until completion checks
// the object itself. These tests pin that check: completion HEADs the key,
// refuses an upload that never arrived, deletes and refuses one that breaks the
// route's rules, and hands the hook the observed size and type.

import (
	"net/http"
	"regexp"
	"testing"
)

type verification struct {
	router    *Router
	storage   *memoryStorage
	completed []Upload
}

func newVerification(t *testing.T) *verification {
	t.Helper()

	v := &verification{storage: newMemoryStorage(t)}
	v.router = NewRouter(v.storage.config(), Routes{
		"avatar": Image(
			MaxSize("2KB"),
			WithMetadata(func(*http.Request, FileMeta) (map[string]any, error) {
				return map[string]any{"userId": "alice"}, nil
			}),
			OnComplete(func(_ *http.Request, done Upload) error {
				v.completed = append(v.completed, done)
				return nil
			}),
		),
	})
	return v
}

type completionEntry struct {
	Success bool      `json:"success"`
	Key     string    `json:"key"`
	File    *FileMeta `json:"file"`
	Error   string    `json:"error"`
	Code    string    `json:"code"`
}

// upload presigns the declared file, stores `stored` bytes of `contentType`
// at its key (or nothing when stored < 0), then completes.
func (v *verification) upload(t *testing.T, stored int, contentType string) (completionEntry, string) {
	t.Helper()

	declared := FileMeta{Name: "me.jpg", Size: 1000, Type: "image/jpeg"}
	presign := postTo(t, v.router, "avatar", "presign", map[string]any{"files": []FileMeta{declared}})
	var issued struct {
		Results []issuedUpload `json:"results"`
	}
	decode(t, presign, &issued)
	key := issued.Results[0].Key

	if stored >= 0 {
		v.storage.put(key, stored, contentType)
	}

	response := postTo(t, v.router, "avatar", "complete", map[string]any{
		"completions": []map[string]any{{
			"key": key, "file": declared, "completionToken": issued.Results[0].CompletionToken,
		}},
	})
	if response.Code != http.StatusOK {
		t.Fatalf("complete = %d: %s", response.Code, response.Body.String())
	}

	var body struct {
		Results []completionEntry `json:"results"`
	}
	decode(t, response, &body)
	return body.Results[0], key
}

func TestTheHookGetsTheSizeAndTypeThatWereStored(t *testing.T) {
	v := newVerification(t)

	result, _ := v.upload(t, 1500, "image/jpeg")

	if !result.Success || len(v.completed) != 1 {
		t.Fatalf("result = %+v, completed %d", result, len(v.completed))
	}
	done := v.completed[0]
	if done.File != (FileMeta{Name: "me.jpg", Size: 1500, Type: "image/jpeg"}) {
		t.Errorf("hook file = %+v", done.File)
	}
	if done.Object.Size != 1500 || done.Object.ContentType != "image/jpeg" ||
		!regexp.MustCompile(`^[0-9a-f]+$`).MatchString(done.Object.ETag) ||
		done.Object.LastModified.IsZero() {
		t.Errorf("hook object = %+v", done.Object)
	}
	// The client is told what was stored, too.
	if result.File == nil || *result.File != done.File {
		t.Errorf("client file = %+v", result.File)
	}
}

func TestACompletionForAnUploadThatNeverArrivedFails(t *testing.T) {
	v := newVerification(t)

	result, _ := v.upload(t, -1, "")

	if result.Success || result.Code != "NOT_FOUND" ||
		!regexp.MustCompile(`(?i)no object`).MatchString(result.Error) {
		t.Errorf("result = %+v, want a NOT_FOUND failure", result)
	}
	if len(v.completed) != 0 {
		t.Errorf("OnComplete ran for an upload that never arrived")
	}
}

func TestAnObjectLargerThanTheRouteAllowsIsDeletedAndRefused(t *testing.T) {
	v := newVerification(t)

	// Declared within the 2KB limit, so presign agreed; then 5KB arrived.
	result, key := v.upload(t, 5000, "image/jpeg")

	if result.Success || result.Code != "VALIDATION_FAILED" {
		t.Errorf("result = %+v, want a VALIDATION_FAILED failure", result)
	}
	if len(v.completed) != 0 || v.storage.has(key) {
		t.Errorf("completed %d, object kept %v", len(v.completed), v.storage.has(key))
	}
}

func TestAnObjectOfATypeTheRouteRefusesIsDeletedAndRefused(t *testing.T) {
	v := newVerification(t)

	result, key := v.upload(t, 1000, "text/html")

	if result.Success || result.Code != "VALIDATION_FAILED" {
		t.Errorf("result = %+v, want a VALIDATION_FAILED failure", result)
	}
	if len(v.completed) != 0 || v.storage.has(key) {
		t.Errorf("completed %d, object kept %v", len(v.completed), v.storage.has(key))
	}
}

func TestOneFailedFileDoesNotFailItsSiblings(t *testing.T) {
	v := newVerification(t)

	files := []FileMeta{
		{Name: "a.jpg", Size: 1000, Type: "image/jpeg"},
		{Name: "b.jpg", Size: 1000, Type: "image/jpeg"},
	}
	presign := postTo(t, v.router, "avatar", "presign", map[string]any{"files": files})
	var issued struct {
		Results []issuedUpload `json:"results"`
	}
	decode(t, presign, &issued)
	v.storage.put(issued.Results[1].Key, 1000, "image/jpeg") // a.jpg never arrives

	completions := make([]map[string]any, 0, 2)
	for i, result := range issued.Results {
		completions = append(completions, map[string]any{
			"key": result.Key, "file": files[i], "completionToken": result.CompletionToken,
		})
	}
	response := postTo(t, v.router, "avatar", "complete", map[string]any{"completions": completions})

	var body struct {
		Results []completionEntry `json:"results"`
	}
	decode(t, response, &body)
	if response.Code != http.StatusOK || body.Results[0].Success || !body.Results[1].Success {
		t.Fatalf("complete = %d: %+v", response.Code, body.Results)
	}
	if len(v.completed) != 1 || v.completed[0].Key != issued.Results[1].Key {
		t.Errorf("completed = %+v", v.completed)
	}
}

func TestMultipartAssemblyIsVerifiedToo(t *testing.T) {
	v := newVerification(t)

	init := postTo(t, v.router, "avatar", "multipart-init", map[string]any{
		"file": FileMeta{Name: "big.jpg", Size: 1000, Type: "image/jpeg"},
	})
	var started struct {
		Session string `json:"session"`
		Key     string `json:"key"`
	}
	decode(t, init, &started)

	// A part's length is not signed, so the assembled object can exceed what
	// was declared. Stand in for that by storing the parts directly.
	v.storage.mu.Lock()
	for id := range v.storage.uploads {
		v.storage.uploads[id][1] = make([]byte, 5000)
	}
	v.storage.mu.Unlock()

	response := postTo(t, v.router, "avatar", "multipart-complete", map[string]any{
		"session": started.Session,
		"parts":   []CompletedPart{{PartNumber: 1, ETag: `"x"`}},
	})

	if response.Code != http.StatusBadRequest || problemCode(t, response) != "VALIDATION_FAILED" {
		t.Fatalf("multipart-complete = %d: %s", response.Code, response.Body.String())
	}
	if len(v.completed) != 0 || v.storage.has(started.Key) {
		t.Errorf("completed %d, object kept %v", len(v.completed), v.storage.has(started.Key))
	}
}
