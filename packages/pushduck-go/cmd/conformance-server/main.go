// Command conformance-server runs the Go implementation against the shared
// conformance suite.
//
//	go run ./cmd/conformance-server
//	pnpm conformance --url http://localhost:4320/api/upload
//
// It exposes exactly the route surface `conformance/README.md` requires, so a
// failure means the implementation disagrees with the protocol rather than
// that the two servers were configured differently.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/abhay-ramesh/pushduck-go/pushduck"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "4320"
	}

	config := pushduck.Config{
		Bucket:          "conformance-bucket",
		Region:          "us-east-1",
		AccessKeyID:     "conformance-key",
		SecretAccessKey: "conformance-secret",
	}

	// Presigning is pure computation, so this needs no bucket and no network.
	requireAuth := func(r *http.Request, _ pushduck.FileMeta) (map[string]any, error) {
		if r.Header.Get("Authorization") != "Bearer conformance-token" {
			return nil, pushduck.NewError("UNAUTHORIZED", "Sign in to upload")
		}
		return map[string]any{"userId": "conformance-user"}, nil
	}

	router := pushduck.NewRouter(config, pushduck.Routes{
		"imageUpload": pushduck.Image(pushduck.MaxSize("5MB")),
		"fileUpload":  pushduck.File(pushduck.MaxSize("50MB")),
		"privateUpload": pushduck.File(
			pushduck.MaxSize("5MB"),
			pushduck.WithMiddleware(requireAuth),
		),
	})

	// `http.Handler` is the whole integration story: this works unchanged with
	// net/http, chi and gorilla, and behind `gin.WrapH` or `echo.WrapHandler`.
	http.Handle("/api/upload", router)

	fmt.Printf("Go conformance server on http://localhost:%s/api/upload\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
