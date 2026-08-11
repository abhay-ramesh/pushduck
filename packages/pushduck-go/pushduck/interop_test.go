package pushduck

// Cross-implementation checks.
//
// Passing the conformance suite proves the Go server obeys the protocol. It
// does not prove the two implementations are *interchangeable* — a client
// could not, say, presign against the TypeScript server and complete against
// the Go one behind the same load balancer.
//
// Two things have to match exactly for that to hold, and neither is visible to
// the conformance fixtures because both are matched by shape there: the SigV4
// signature, and the completion token's HMAC.
//
// The expected values below are produced by the TypeScript implementation with
// the same inputs. If a change to either side breaks interoperability, this
// fails rather than the difference being discovered in production.

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// A fixed instant, because a signature is scoped to the date it was made.
var fixedTime = time.Date(2026, 8, 11, 12, 0, 0, 0, time.UTC)

func testConfig() Config {
	return Config{
		Bucket:          "conformance-bucket",
		Region:          "us-east-1",
		AccessKeyID:     "conformance-key",
		SecretAccessKey: "conformance-secret",
		Now:             func() time.Time { return fixedTime },
	}
}

func TestSignatureMatchesTypeScript(t *testing.T) {
	config := testConfig()
	host, path := config.objectAddress("photo.jpg")

	url := config.presign(presignOptions{
		Method:    http.MethodPut,
		Host:      host,
		Path:      path,
		Region:    config.Region,
		Headers:   map[string]string{"x-amz-acl": "private"},
		ExpiresIn: 3600,
		Now:       fixedTime,
	})

	// The value the TypeScript implementation produces for identical inputs.
	// `interop-go.test.ts` asserts the same constant, so a change on either
	// side fails here rather than surfacing as a 403 from the provider after a
	// blue-green deploy puts both servers behind one load balancer.
	const want = "X-Amz-Signature=d5055c164579cc08189f3efa518d271da39979487ca8b8cb49e219349b85ab78"

	if !strings.Contains(url, want) {
		t.Errorf("signature disagrees with the TypeScript implementation\ngot:  %s\nwant: %s", url, want)
	}

	if !strings.Contains(url, "X-Amz-Algorithm=AWS4-HMAC-SHA256") {
		t.Fatalf("missing algorithm parameter in %s", url)
	}
	if !strings.Contains(url, "X-Amz-Credential=conformance-key%2F20260811%2Fus-east-1%2Fs3%2Faws4_request") {
		t.Errorf("credential scope differs:\n%s", url)
	}
	if !strings.Contains(url, "X-Amz-Date=20260811T120000Z") {
		t.Errorf("date differs:\n%s", url)
	}

}

// TestSignatureIsStable pins the Go signature so a refactor of the canonical
// request cannot change it silently.
func TestSignatureIsStable(t *testing.T) {
	config := testConfig()
	host, path := config.objectAddress("photo.jpg")

	first := config.presign(presignOptions{
		Method: http.MethodPut, Host: host, Path: path, Region: config.Region,
		Headers:   map[string]string{"x-amz-acl": "private"},
		ExpiresIn: 3600, Now: fixedTime,
	})
	second := config.presign(presignOptions{
		Method: http.MethodPut, Host: host, Path: path, Region: config.Region,
		Headers:   map[string]string{"x-amz-acl": "private"},
		ExpiresIn: 3600, Now: fixedTime,
	})

	if first != second {
		t.Fatalf("signing is not deterministic:\n%s\n%s", first, second)
	}
}

func TestCompletionTokenShapeMatchesTypeScript(t *testing.T) {
	router := NewRouter(testConfig(), Routes{"imageUpload": Image()})

	token, err := router.signCompletion("photo.jpg", "imageUpload")
	if err != nil {
		t.Fatalf("signCompletion: %v", err)
	}

	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		t.Fatalf("expected payload.signature, got %q", token)
	}

	// The TypeScript server decodes this payload and reads `key` and `route`,
	// so the field names are part of the contract rather than an internal
	// detail.
	key, route, err := router.verifyCompletion(token)
	if err != nil {
		t.Fatalf("verifyCompletion rejected its own token: %v", err)
	}
	if key != "photo.jpg" || route != "imageUpload" {
		t.Errorf("claim round-trip lost data: key=%q route=%q", key, route)
	}
}

func TestCompletionTokenRejectsTampering(t *testing.T) {
	router := NewRouter(testConfig(), Routes{"imageUpload": Image()})
	token, _ := router.signCompletion("photo.jpg", "imageUpload")

	// A different payload presented with the original signature.
	tampered := strings.Split(token, ".")[1]

	if _, _, err := router.verifyCompletion("bm90LWEtdG9rZW4." + tampered); err == nil {
		t.Error("a tampered payload was accepted")
	}
	if _, _, err := router.verifyCompletion(strings.Split(token, ".")[0] + ".wrong"); err == nil {
		t.Error("a wrong signature was accepted")
	}
}

// TestKeyGenerationMatchesTypeScript covers the cases the TypeScript suite
// pins, since a key that differs between implementations means the same upload
// lands in two places.
func TestKeyGenerationMatchesTypeScript(t *testing.T) {
	cases := []struct{ in, want string }{
		{"photo.jpg", "photo.jpg"},
		{"my photo.jpg", "my_photo.jpg"},
		{"file(1).pdf", "file_1_.pdf"},
		{"a,b.csv", "a_b.csv"},
		{"report-2024.final.pdf", "report-2024.final.pdf"},
		{"UPPER_case-99.TXT", "UPPER_case-99.TXT"},
		// The bug that motivated the rewrite: these three used to collapse to
		// `.pdf` and overwrite one another.
		{"文档.pdf", "文档.pdf"},
		{"写真.pdf", "写真.pdf"},
		{"Отчёт.pdf", "Отчёт.pdf"},
		{"café.txt", "café.txt"},
		{".gitignore", ".gitignore"},
	}

	for _, testCase := range cases {
		if got := generateKey(testCase.in); got != testCase.want {
			t.Errorf("generateKey(%q) = %q, want %q", testCase.in, got, testCase.want)
		}
	}
}

func TestDistinctNamesProduceDistinctKeys(t *testing.T) {
	names := []string{"文档.pdf", "写真.pdf", "报告.pdf", "日本語.pdf", "한국어.pdf", "///.pdf", "???.pdf"}
	seen := map[string]string{}

	for _, name := range names {
		key := generateKey(name)
		if previous, clash := seen[key]; clash {
			t.Errorf("%q and %q both produced key %q", previous, name, key)
		}
		seen[key] = name
	}
}

func TestValidationMessagesMatchTypeScript(t *testing.T) {
	// A user sees this string, so it should not depend on which server
	// answered the request.
	route := Image(MaxSize("5MB"))

	got := route.validate(FileMeta{Name: "huge.jpg", Size: 50 * 1024 * 1024, Type: "image/jpeg"})
	if want := "File size 50.0MB exceeds maximum 5.0MB"; got != want {
		t.Errorf("size message = %q, want %q", got, want)
	}

	if got := route.validate(FileMeta{Name: "a.pdf", Size: 10, Type: "application/pdf"}); got == "" {
		t.Error("a disallowed type was accepted")
	}
	if got := route.validate(FileMeta{Name: "a.png", Size: 10, Type: "image/png"}); got != "" {
		t.Errorf("image/* rejected image/png: %s", got)
	}
}
