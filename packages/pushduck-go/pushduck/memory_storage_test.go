package pushduck

// An in-memory object store that answers the slice of the S3 API the router
// uses, over real HTTP.
//
// Completion asks storage what it holds, so a router test needs storage that
// answers. MinIO answers truthfully but is not always running; this answers
// every time, so the completion rules are tested on every `go test` and the
// MinIO tests stay about signatures and assembly. Signatures are not checked
// here — that is what MinIO is for.

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

type storedObject struct {
	body        []byte
	contentType string
	modified    time.Time
}

type memoryStorage struct {
	server  *httptest.Server
	bucket  string
	mu      sync.Mutex
	objects map[string]storedObject
	uploads map[string]map[int][]byte // uploadId → part number → bytes
	types   map[string]string         // uploadId → content type
	next    int
}

func newMemoryStorage(t *testing.T) *memoryStorage {
	t.Helper()

	storage := &memoryStorage{
		bucket:  "fake-bucket",
		objects: map[string]storedObject{},
		uploads: map[string]map[int][]byte{},
		types:   map[string]string{},
	}
	storage.server = httptest.NewServer(http.HandlerFunc(storage.serve))
	t.Cleanup(storage.server.Close)
	return storage
}

// config points a router at this store.
func (s *memoryStorage) config() Config {
	return Config{
		Bucket:          s.bucket,
		Region:          "us-east-1",
		AccessKeyID:     "fake-key",
		SecretAccessKey: "fake-secret",
		Endpoint:        s.server.URL,
		ForcePathStyle:  true,
	}
}

// put stores an object directly, as a browser's PUT would.
func (s *memoryStorage) put(key string, size int, contentType string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[key] = storedObject{body: make([]byte, size), contentType: contentType, modified: time.Now()}
}

func (s *memoryStorage) has(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.objects[key]
	return ok
}

func etagOf(body []byte) string {
	sum := md5.Sum(body)
	return `"` + hex.EncodeToString(sum[:]) + `"`
}

func (s *memoryStorage) serve(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.TrimPrefix(r.URL.Path, "/"+s.bucket+"/")
	query := r.URL.Query()
	body, _ := io.ReadAll(r.Body)

	switch {
	case r.Method == http.MethodPost && query.Has("uploads"):
		s.next++
		id := fmt.Sprintf("upload-%d", s.next)
		s.uploads[id] = map[int][]byte{}
		s.types[id] = r.Header.Get("Content-Type")
		fmt.Fprintf(w, "<InitiateMultipartUploadResult><Key>%s</Key><UploadId>%s</UploadId></InitiateMultipartUploadResult>", key, id)

	case r.Method == http.MethodPut && query.Has("partNumber"):
		parts, ok := s.uploads[query.Get("uploadId")]
		if !ok {
			noSuchUpload(w)
			return
		}
		number, _ := strconv.Atoi(query.Get("partNumber"))
		parts[number] = body
		w.Header().Set("ETag", etagOf(body))

	case r.Method == http.MethodPost && query.Has("uploadId"):
		id := query.Get("uploadId")
		parts, ok := s.uploads[id]
		if !ok {
			noSuchUpload(w)
			return
		}
		var document struct {
			Parts []struct {
				PartNumber int `xml:"PartNumber"`
			} `xml:"Part"`
		}
		_ = xml.Unmarshal(body, &document)
		var assembled []byte
		for _, part := range document.Parts {
			assembled = append(assembled, parts[part.PartNumber]...)
		}
		s.objects[key] = storedObject{body: assembled, contentType: s.types[id], modified: time.Now()}
		delete(s.uploads, id)
		fmt.Fprint(w, "<CompleteMultipartUploadResult/>")

	case r.Method == http.MethodGet && query.Has("uploadId"):
		parts, ok := s.uploads[query.Get("uploadId")]
		if !ok {
			noSuchUpload(w)
			return
		}
		numbers := make([]int, 0, len(parts))
		for number := range parts {
			numbers = append(numbers, number)
		}
		sort.Ints(numbers)
		var listing strings.Builder
		listing.WriteString("<ListPartsResult><IsTruncated>false</IsTruncated>")
		for _, number := range numbers {
			fmt.Fprintf(&listing, "<Part><PartNumber>%d</PartNumber><ETag>%s</ETag></Part>",
				number, escapeXML(etagOf(parts[number])))
		}
		listing.WriteString("</ListPartsResult>")
		fmt.Fprint(w, listing.String())

	case r.Method == http.MethodDelete && query.Has("uploadId"):
		delete(s.uploads, query.Get("uploadId"))
		w.WriteHeader(http.StatusNoContent)

	case r.Method == http.MethodPut:
		s.objects[key] = storedObject{body: body, contentType: r.Header.Get("Content-Type"), modified: time.Now()}
		w.Header().Set("ETag", etagOf(body))

	case r.Method == http.MethodHead || r.Method == http.MethodGet:
		object, ok := s.objects[key]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", object.contentType)
		w.Header().Set("Content-Length", strconv.Itoa(len(object.body)))
		w.Header().Set("ETag", etagOf(object.body))
		w.Header().Set("Last-Modified", object.modified.UTC().Format(http.TimeFormat))
		if r.Method == http.MethodGet {
			_, _ = w.Write(object.body)
		}

	case r.Method == http.MethodDelete:
		delete(s.objects, key)
		w.WriteHeader(http.StatusNoContent)

	default:
		w.WriteHeader(http.StatusNotImplemented)
	}
}

func noSuchUpload(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprint(w, "<Error><Code>NoSuchUpload</Code><Message>gone</Message></Error>")
}
