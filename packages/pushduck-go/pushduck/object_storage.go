package pushduck

// Reading back and removing a single object — what completion needs to check
// that an upload actually happened, and to undo one that broke the route's
// rules.

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ObjectInfo is a stored object as the provider reports it.
//
// Everything a client says about a file is a claim; this is the observation.
// Use Size for billing and quotas, never a declared size.
type ObjectInfo struct {
	Size        int64
	ContentType string
	// ETag without its surrounding quotes.
	ETag         string
	LastModified time.Time
}

// headObject reports the object at key, or nil when there is none.
//
// A 403 is not read as "missing". S3 and R2 answer 403 for a missing object
// when the credential lacks ListBucket, and treating that as absence would
// refuse every upload for a reason nobody could see; it is reported as
// STORAGE_ACCESS_DENIED instead.
func (c *Config) headObject(key string) (*ObjectInfo, error) {
	response, err := c.signedRequest(http.MethodHead, key, nil, nil, nil)
	if err != nil {
		return nil, err
	}
	response.Body.Close()

	switch {
	case response.StatusCode == http.StatusNotFound:
		return nil, nil
	case response.StatusCode == http.StatusForbidden:
		return nil, NewError("STORAGE_ACCESS_DENIED",
			"HeadObject denied by storage: the credential cannot read uploaded objects")
	case response.StatusCode >= 300:
		return nil, NewError("STORAGE_UNAVAILABLE",
			"HeadObject failed with HTTP "+strconv.Itoa(response.StatusCode))
	}

	if response.ContentLength < 0 {
		return nil, NewError("STORAGE_UNAVAILABLE", "HeadObject returned no Content-Length")
	}

	info := &ObjectInfo{
		Size:        response.ContentLength,
		ContentType: response.Header.Get("Content-Type"),
		ETag:        strings.Trim(response.Header.Get("ETag"), `"`),
	}
	if modified, err := http.ParseTime(response.Header.Get("Last-Modified")); err == nil {
		info.LastModified = modified
	}
	return info, nil
}

// deleteObject removes the object at key. Already gone is success.
func (c *Config) deleteObject(key string) error {
	response, err := c.signedRequest(http.MethodDelete, key, nil, nil, nil)
	if err != nil {
		return err
	}

	if response.StatusCode == http.StatusNotFound {
		response.Body.Close()
		return nil
	}

	_, err = readStorageResponse(response, "DeleteObject")
	return err
}
