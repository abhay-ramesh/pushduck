package pushduck

// Every request of an upload acts on the decision presign made.
//
// Presign runs the metadata hooks over the caller's input and seals the outcome
// into a receipt. Each later request — completion, and for multipart the part
// signing, listing, abort and assembly — reads that receipt back. These tests
// pin the three consequences:
//
//  1. OnComplete receives the metadata the hooks produced at presign, whatever
//     the completion request claims.
//  2. The hooks see the same input on every request, with a phase saying which
//     one this is, so a hook that reads a field it does not return keeps
//     working, and work meant to happen once can be skipped.
//  3. Single-PUT and multipart uploads finish through the same step, so the
//     same hook fires with the same guarantees whatever the file's size.

import (
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

var flowFile = FileMeta{Name: "photo.jpg", Size: 1000, Type: "image/jpeg"}

type hookCall struct {
	Phase Phase
	Input map[string]any
	File  FileMeta
}

type flow struct {
	router    *Router
	storage   *memoryStorage
	calls     []hookCall
	completed []Upload
}

// newFlow builds a router whose hook authenticates from a header, requires
// `slug` in the client's metadata, and returns a shape that does NOT contain
// `slug` — the hook that broke when completion handed hooks their own output
// as input.
func newFlow(t *testing.T) *flow {
	t.Helper()

	f := &flow{storage: newMemoryStorage(t)}

	hook := func(r *http.Request, file FileMeta) (map[string]any, error) {
		f.calls = append(f.calls, hookCall{PhaseOf(r), ClientMetadata(r), file})

		user := r.Header.Get("X-User")
		if user == "" {
			return nil, NewError("UNAUTHORIZED", "Sign in")
		}
		slug, ok := ClientMetadata(r)["slug"].(string)
		if !ok {
			return nil, NewError("BAD_REQUEST", "slug is required")
		}
		return map[string]any{"userId": user, "recordId": "record-for-" + slug}, nil
	}

	onComplete := OnComplete(func(_ *http.Request, done Upload) error {
		f.completed = append(f.completed, done)
		return nil
	})

	f.router = NewRouter(f.storage.config(), Routes{
		"attachment": File(MaxSize("50MB"), WithMetadata(hook), onComplete),
		"other":      File(MaxSize("50MB"), WithMetadata(hook)),
	})
	return f
}

type issuedUpload struct {
	Key             string         `json:"key"`
	CompletionToken string         `json:"completionToken"`
	Metadata        map[string]any `json:"metadata"`
}

// presign issues one upload as alice, and stores its bytes as the browser's
// PUT would.
func (f *flow) presign(t *testing.T, route string) issuedUpload {
	t.Helper()

	response := postTo(t, f.router, route, "presign", map[string]any{
		"files": []FileMeta{flowFile}, "metadata": map[string]any{"slug": "abc"},
	}, "X-User", "alice")
	if response.Code != http.StatusOK {
		t.Fatalf("presign = %d: %s", response.Code, response.Body.String())
	}

	var body struct {
		Results []issuedUpload `json:"results"`
	}
	decode(t, response, &body)
	f.storage.put(body.Results[0].Key, int(flowFile.Size), flowFile.Type)
	return body.Results[0]
}

func (f *flow) complete(t *testing.T, route string, entry map[string]any, headers ...string) (int, string) {
	t.Helper()
	response := postTo(t, f.router, route, "complete", map[string]any{
		"completions": []map[string]any{entry},
	}, headers...)
	return response.Code, response.Body.String()
}

func (f *flow) phases() []Phase {
	phases := make([]Phase, 0, len(f.calls))
	for _, call := range f.calls {
		phases = append(phases, call.Phase)
	}
	return phases
}

var sealedMetadata = map[string]any{"userId": "alice", "recordId": "record-for-abc"}

func TestCompletionGivesTheHookTheMetadataPresignDecided(t *testing.T) {
	f := newFlow(t)
	issued := f.presign(t, "attachment")

	status, body := f.complete(t, "attachment", map[string]any{
		"key":             issued.Key,
		"file":            FileMeta{Name: flowFile.Name, Size: 1, Type: flowFile.Type},
		"metadata":        map[string]any{"userId": "victim", "recordId": "someone-elses-record"},
		"completionToken": issued.CompletionToken,
	}, "X-User", "alice")

	if status != http.StatusOK || len(f.completed) != 1 {
		t.Fatalf("complete = %d (completed %d): %s", status, len(f.completed), body)
	}
	done := f.completed[0]
	if !reflect.DeepEqual(done.Metadata, sealedMetadata) {
		t.Errorf("OnComplete metadata = %v, want %v", done.Metadata, sealedMetadata)
	}
	if done.ID == "" || done.Key != issued.Key {
		t.Errorf("OnComplete upload = %+v", done)
	}
}

func TestCompletionRunsTheHooksOverTheSameInputWithItsPhase(t *testing.T) {
	f := newFlow(t)
	issued := f.presign(t, "attachment")

	// Before receipts, completion handed the hook {userId, recordId} — no
	// slug — so this hook refused every completion.
	status, body := f.complete(t, "attachment", map[string]any{
		"key": issued.Key, "file": flowFile, "metadata": map[string]any{},
		"completionToken": issued.CompletionToken,
	}, "X-User", "alice")

	if status != http.StatusOK {
		t.Fatalf("complete = %d: %s", status, body)
	}
	if got := f.phases(); !reflect.DeepEqual(got, []Phase{PhasePresign, PhaseComplete}) {
		t.Errorf("phases = %v", got)
	}
	if !reflect.DeepEqual(f.calls[1].Input, map[string]any{"slug": "abc"}) || f.calls[1].File != flowFile {
		t.Errorf("completion hook saw %+v", f.calls[1])
	}
}

func TestCompletionStillRequiresAnAuthorisedCaller(t *testing.T) {
	f := newFlow(t)
	issued := f.presign(t, "attachment")

	status, _ := f.complete(t, "attachment", map[string]any{
		"key": issued.Key, "file": flowFile, "completionToken": issued.CompletionToken,
	})

	if status != http.StatusUnauthorized || len(f.completed) != 0 {
		t.Fatalf("anonymous completion = %d, completed %d", status, len(f.completed))
	}
}

func TestAReceiptIsRefusedOnAnotherRoute(t *testing.T) {
	f := newFlow(t)
	issued := f.presign(t, "other")

	status, _ := f.complete(t, "attachment", map[string]any{
		"key": issued.Key, "file": flowFile, "completionToken": issued.CompletionToken,
	}, "X-User", "alice")

	if status != http.StatusForbidden {
		t.Fatalf("cross-route completion = %d, want 403", status)
	}
}

func TestAReceiptIsRefusedForAnotherKey(t *testing.T) {
	f := newFlow(t)
	issued := f.presign(t, "attachment")

	status, _ := f.complete(t, "attachment", map[string]any{
		"key": "someone/else.jpg", "file": flowFile, "completionToken": issued.CompletionToken,
	}, "X-User", "alice")

	if status != http.StatusForbidden || len(f.completed) != 0 {
		t.Fatalf("completion for another key = %d, completed %d", status, len(f.completed))
	}
}

func TestAV1TokenKeepsTheOldBehaviourUntilRemoved(t *testing.T) {
	f := newFlow(t)

	// An upload presigned by the previous version, completed after the
	// deploy: the hooks run over the metadata the client echoes back.
	token, _ := f.router.signCompletion("photo.jpg", "attachment")
	f.storage.put("photo.jpg", int(flowFile.Size), flowFile.Type)

	status, body := f.complete(t, "attachment", map[string]any{
		"key": "photo.jpg", "file": flowFile, "metadata": map[string]any{"slug": "abc"},
		"completionToken": token,
	}, "X-User", "alice")

	if status != http.StatusOK || len(f.completed) != 1 {
		t.Fatalf("v1 completion = %d (completed %d): %s", status, len(f.completed), body)
	}
	if done := f.completed[0]; done.ID != "" || !reflect.DeepEqual(done.Metadata, sealedMetadata) {
		t.Errorf("v1 upload = %+v", done)
	}
}

// ─── multipart ──────────────────────────────────────────────────────────────

// multipartUpload runs init, sign, one part PUT and complete, with the given
// extra fields on the complete request.
func (f *flow) multipartUpload(t *testing.T, extra map[string]any) (int, string) {
	t.Helper()

	init := postTo(t, f.router, "attachment", "multipart-init", map[string]any{
		"file": flowFile, "metadata": map[string]any{"slug": "abc"},
	}, "X-User", "alice")
	if init.Code != http.StatusOK {
		t.Fatalf("init = %d: %s", init.Code, init.Body.String())
	}
	var started struct {
		Session string `json:"session"`
	}
	decode(t, init, &started)

	sign := postTo(t, f.router, "attachment", "multipart-sign", map[string]any{
		"session": started.Session, "partNumbers": []int{1},
	}, "X-User", "alice")
	if sign.Code != http.StatusOK {
		t.Fatalf("sign = %d: %s", sign.Code, sign.Body.String())
	}
	var parts []struct {
		URL string `json:"url"`
	}
	decode(t, sign, &parts)

	put, _ := http.NewRequest(http.MethodPut, parts[0].URL, strings.NewReader(strings.Repeat("x", int(flowFile.Size))))
	response, err := http.DefaultClient.Do(put)
	if err != nil {
		t.Fatalf("PUT part: %v", err)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	response.Body.Close()

	body := map[string]any{
		"session": started.Session,
		"parts":   []CompletedPart{{PartNumber: 1, ETag: response.Header.Get("ETag")}},
		"file":    flowFile,
	}
	for key, value := range extra {
		body[key] = value
	}
	done := postTo(t, f.router, "attachment", "multipart-complete", body, "X-User", "alice")
	return done.Code, done.Body.String()
}

func TestMultipartFiresTheSameHookWithSealedMetadata(t *testing.T) {
	f := newFlow(t)

	status, body := f.multipartUpload(t, map[string]any{"metadata": map[string]any{"userId": "victim"}})

	if status != http.StatusOK || len(f.completed) != 1 {
		t.Fatalf("multipart-complete = %d (completed %d): %s", status, len(f.completed), body)
	}
	if done := f.completed[0]; !reflect.DeepEqual(done.Metadata, sealedMetadata) || done.ID == "" {
		t.Errorf("OnComplete upload = %+v", done)
	}
}

func TestMultipartRunsTheHooksOverTheOriginalInputForEveryRequest(t *testing.T) {
	f := newFlow(t)

	if status, body := f.multipartUpload(t, nil); status != http.StatusOK {
		t.Fatalf("multipart-complete = %d: %s", status, body)
	}

	if got := f.phases(); !reflect.DeepEqual(got, []Phase{PhasePresign, PhaseUpload, PhaseComplete}) {
		t.Errorf("phases = %v", got)
	}
	for _, call := range f.calls {
		if !reflect.DeepEqual(call.Input, map[string]any{"slug": "abc"}) || call.File != flowFile {
			t.Errorf("%s hook saw %+v", call.Phase, call)
		}
	}
}

func TestAMultipartSessionIsRefusedOnAnotherRoute(t *testing.T) {
	f := newFlow(t)

	init := postTo(t, f.router, "other", "multipart-init", map[string]any{
		"file": flowFile, "metadata": map[string]any{"slug": "abc"},
	}, "X-User", "alice")
	var started struct {
		Session string `json:"session"`
	}
	decode(t, init, &started)

	sign := postTo(t, f.router, "attachment", "multipart-sign", map[string]any{
		"session": started.Session, "partNumbers": []int{1},
	}, "X-User", "alice")
	if sign.Code != http.StatusForbidden {
		t.Fatalf("cross-route sign = %d, want 403: %s", sign.Code, sign.Body.String())
	}
}

func TestASinglePutReceiptCannotDriveMultipartOrTheReverse(t *testing.T) {
	f := newFlow(t)
	issued := f.presign(t, "attachment")

	sign := postTo(t, f.router, "attachment", "multipart-sign", map[string]any{
		"session": issued.CompletionToken, "partNumbers": []int{1},
	}, "X-User", "alice")
	if sign.Code != http.StatusBadRequest {
		t.Errorf("single-PUT receipt at multipart-sign = %d, want 400", sign.Code)
	}

	init := postTo(t, f.router, "attachment", "multipart-init", map[string]any{
		"file": flowFile, "metadata": map[string]any{"slug": "abc"},
	}, "X-User", "alice")
	var started struct {
		Session string `json:"session"`
		Key     string `json:"key"`
	}
	decode(t, init, &started)

	status, _ := f.complete(t, "attachment", map[string]any{
		"key": started.Key, "file": flowFile, "completionToken": started.Session,
	}, "X-User", "alice")
	if status != http.StatusForbidden {
		t.Errorf("multipart session at complete = %d, want 403", status)
	}
}
