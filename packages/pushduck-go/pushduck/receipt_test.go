package pushduck

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// Sealed by the TypeScript server (`sealReceipt` in core/router/receipt.ts)
// with the secret "conformance-secret". If either side changes the format,
// the key derivation or the encoding, a receipt issued by one server stops
// completing on the other — after a deploy, with uploads in flight.
const (
	typeScriptReceipt = "eyJ2IjoyLCJpZCI6IkFBRUNBd1FGQmdjSUNRb0xEQTBPRHciLCJyb3V0ZSI6ImltYWdlVXBsb2FkIiwia2V5IjoicGhvdG8uanBnIiwiZmlsZSI6eyJuYW1lIjoicGhvdG8uanBnIiwic2l6ZSI6MTAyNCwidHlwZSI6ImltYWdlL2pwZWcifSwiaW5wdXQiOnsiYWxidW1JZCI6InN1bW1lciJ9LCJtZXRhZGF0YSI6eyJ1c2VySWQiOiJ1XzEifSwiZXhwIjo0MTAyNDQ0ODAwfQ.d9mEArXz0KrWwcq9KgzX2wd65o7Qk3Fl6twVZ4ZGync"

	typeScriptMultipartReceipt = "eyJ2IjoyLCJpZCI6IkFBRUNBd1FGQmdjSUNRb0xEQTBPRHciLCJyb3V0ZSI6ImltYWdlVXBsb2FkIiwia2V5IjoicGhvdG8uanBnIiwiZmlsZSI6eyJuYW1lIjoicGhvdG8uanBnIiwic2l6ZSI6MTAyNCwidHlwZSI6ImltYWdlL2pwZWcifSwiaW5wdXQiOnsiYWxidW1JZCI6InN1bW1lciJ9LCJtZXRhZGF0YSI6eyJ1c2VySWQiOiJ1XzEifSwiZXhwIjo0MTAyNDQ0ODAwLCJtdWx0aXBhcnQiOnsidXBsb2FkSWQiOiJ1cGxvYWQtMSIsInBhcnRTaXplIjo1MjQyODgwfX0.Eg9vbImwxxW9CHf9Y8k0bAmg47WX0LYpydJu_f37ma4"

	// The same receipt with exp: 1.
	typeScriptExpiredReceipt = "eyJ2IjoyLCJpZCI6IkFBRUNBd1FGQmdjSUNRb0xEQTBPRHciLCJyb3V0ZSI6ImltYWdlVXBsb2FkIiwia2V5IjoicGhvdG8uanBnIiwiZmlsZSI6eyJuYW1lIjoicGhvdG8uanBnIiwic2l6ZSI6MTAyNCwidHlwZSI6ImltYWdlL2pwZWcifSwiaW5wdXQiOnsiYWxidW1JZCI6InN1bW1lciJ9LCJtZXRhZGF0YSI6eyJ1c2VySWQiOiJ1XzEifSwiZXhwIjoxfQ.Gy-cemJ5eipYWt8rd8udszs_ezpxagmO8CgDd5LWIWA"
)

func receiptRouter() *Router {
	return NewRouter(testConfig(), Routes{"imageUpload": Image()})
}

func TestOpensAReceiptTheTypeScriptServerSealed(t *testing.T) {
	opened, err := receiptRouter().openReceipt(typeScriptReceipt)
	if err != nil || opened == nil {
		t.Fatalf("openReceipt = %+v, %v", opened, err)
	}

	want := receipt{
		V: 2, ID: "AAECAwQFBgcICQoLDA0ODw", Route: "imageUpload", Key: "photo.jpg",
		File:     FileMeta{Name: "photo.jpg", Size: 1024, Type: "image/jpeg"},
		Input:    map[string]any{"albumId": "summer"},
		Metadata: map[string]any{"userId": "u_1"},
		Exp:      4102444800,
	}
	if !reflect.DeepEqual(*opened, want) {
		t.Errorf("opened %+v\nwant   %+v", *opened, want)
	}

	multipart, err := receiptRouter().openReceipt(typeScriptMultipartReceipt)
	if err != nil || multipart == nil || multipart.Multipart == nil {
		t.Fatalf("multipart receipt = %+v, %v", multipart, err)
	}
	if *multipart.Multipart != (receiptMultipart{UploadID: "upload-1", PartSize: 5242880}) {
		t.Errorf("part plan = %+v", *multipart.Multipart)
	}
}

func TestRefusesAnExpiredReceipt(t *testing.T) {
	_, err := receiptRouter().openReceipt(typeScriptExpiredReceipt)
	if err == nil || asError(err).Code != "FORBIDDEN" {
		t.Fatalf("expired receipt = %v, want FORBIDDEN", err)
	}
}

func TestReceiptRoundTripsAndExpires(t *testing.T) {
	config := testConfig()
	router := NewRouter(config, Routes{"imageUpload": Image()})

	token, err := router.sealReceipt(receipt{
		ID: newUploadID(), Route: "imageUpload", Key: "a.png",
		File: FileMeta{Name: "a.png", Size: 1, Type: "image/png"},
		Exp:  fixedTime.Add(time.Minute).Unix(),
	})
	if err != nil {
		t.Fatalf("seal: %v", err)
	}

	opened, err := router.openReceipt(token)
	if err != nil || opened == nil {
		t.Fatalf("open: %+v, %v", opened, err)
	}
	// Absent input and metadata are sealed as objects, which the other
	// servers require.
	if opened.Input == nil || opened.Metadata == nil {
		t.Errorf("input or metadata came back nil: %+v", opened)
	}

	later := config
	later.Now = func() time.Time { return fixedTime.Add(time.Minute) }
	if _, err := NewRouter(later, nil).openReceipt(token); err == nil {
		t.Error("a receipt was accepted at its expiry")
	}
}

func TestAnythingButAReceiptIsNotOpened(t *testing.T) {
	router := receiptRouter()

	completion, _ := router.signCompletion("photo.jpg", "imageUpload")
	session, _ := router.signSession(multipartSession{Key: "a", UploadID: "u", Route: "imageUpload", PartSize: 1})
	payload := strings.Split(typeScriptReceipt, ".")[0]

	// Not receipts, so not refusals either: the caller falls back to the v1
	// formats, which refuse them in their own terms.
	for name, token := range map[string]string{
		"v1 completion token":   completion,
		"v1 multipart session":  session,
		"forged signature":      payload + ".d9mEArXz0KrWwcq9KgzX2wd65o7Qk3Fl6twVZ4ZGyn0",
		"another server secret": strings.Replace(typeScriptReceipt, "d9mE", "e9mE", 1),
		"not a token":           "hello",
	} {
		opened, err := router.openReceipt(token)
		if opened != nil || err != nil {
			t.Errorf("%s: openReceipt = %+v, %v; want nil, nil", name, opened, err)
		}
	}
}

func TestUploadIDsAreUnguessable(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		id := newUploadID()
		if len(id) != 22 || seen[id] {
			t.Fatalf("upload id %q is short or repeated", id)
		}
		seen[id] = true
	}
}
