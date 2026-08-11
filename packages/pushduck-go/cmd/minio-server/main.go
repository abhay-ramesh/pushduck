// Command minio-server runs the Go implementation against a local MinIO, so
// the JavaScript client can be pointed at it end to end.
//
// This is the claim the whole protocol exists to support: a React frontend and
// a Go backend, with no shared code between them.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/abhay-ramesh/pushduck-go/pushduck"
)

func main() {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "http://127.0.0.1:9010"
	}

	router := pushduck.NewRouter(pushduck.Config{
		Bucket:          "test-uploads",
		Region:          "us-east-1",
		AccessKeyID:     "minioadmin",
		SecretAccessKey: "minioadmin",
		Endpoint:        endpoint,
		ForcePathStyle:  true,
	}, pushduck.Routes{
		"bigUpload":   pushduck.File(pushduck.MaxSize("500MB")),
		"imageUpload": pushduck.Image(pushduck.MaxSize("5MB")),
	})

	http.Handle("/api/upload", router)
	fmt.Println("Go + MinIO server on http://localhost:4321/api/upload")
	log.Fatal(http.ListenAndServe(":4321", nil))
}
