package pushduck

// Configuration and the route definition surface.
//
// The TypeScript package uses a fluent builder —
// `s3.image().maxFileSize("5MB").middleware(auth)` — because TypeScript's
// inference carries types through each link of the chain and the result is
// genuinely type-safe.
//
// Go has no equivalent, so copying that shape would produce something that
// looks like pushduck and feels like nothing else in a Go codebase. Routes are
// therefore plain structs with a functional-options constructor: the idiom a
// Go developer already reads without explanation. The protocol is identical;
// only the surface is native.

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Config holds provider credentials and defaults.
type Config struct {
	Bucket          string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	// SessionToken is set when credentials come from STS rather than a static
	// key pair: an ECS task role, EKS IRSA, or an OIDC AssumeRole.
	SessionToken string
	// Endpoint overrides the AWS host for S3-compatible providers (R2, MinIO,
	// Spaces). Empty means AWS.
	Endpoint string
	// ForcePathStyle puts the bucket in the path rather than the hostname,
	// which MinIO and R2 require.
	ForcePathStyle bool
	// UploadExpiry defaults to one hour when zero.
	UploadExpiry time.Duration

	// Now is injectable so signatures are reproducible in tests.
	Now func() time.Time
}

func (c *Config) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}

func (c *Config) uploadExpiry() int {
	if c.UploadExpiry > 0 {
		return int(c.UploadExpiry.Seconds())
	}
	return 3600
}

// FileMeta is what a client says about a file before uploading it.
//
// Untrusted: the size and type are claims, which is why validation happens
// here and the provider enforces its own limits independently.
type FileMeta struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	Type string `json:"type"`
}

// Middleware authenticates a request and returns metadata for the upload.
//
// Returning an error rejects the whole request. Return an *Error to control
// the status; any other error becomes a 500 with its detail withheld.
type Middleware func(r *http.Request, file FileMeta) (map[string]any, error)

// CompleteHook runs once an upload finishes.
//
// This is where an application inserts the database row, attaches the file to
// a record, or grants access to it — which is why the protocol authenticates
// the call and binds the key to a token.
type CompleteHook func(r *http.Request, key string, file FileMeta, metadata map[string]any) error

// Route is one named upload endpoint.
type Route struct {
	MaxSize    int64
	AllowTypes []string
	Middleware []Middleware
	OnComplete CompleteHook
	// RequireCompletionToken rejects a completion that presents no token.
	// Off by default so clients older than the token still work.
	RequireCompletionToken bool
}

// RouteOption configures a Route.
type RouteOption func(*Route)

// MaxSize accepts the same human sizes as the TypeScript package: "5MB", "1.5GB".
func MaxSize(size string) RouteOption {
	return func(route *Route) {
		bytes, err := parseSize(size)
		if err != nil {
			// A malformed limit is a programming error at startup, and silently
			// accepting everything would be far worse than refusing to boot.
			panic(fmt.Sprintf("pushduck: invalid MaxSize %q: %v", size, err))
		}
		route.MaxSize = bytes
	}
}

// AllowTypes restricts the accepted MIME types. A trailing `/*` matches a
// whole family, as `image/*` does in an <input accept> attribute.
func AllowTypes(types ...string) RouteOption {
	return func(route *Route) { route.AllowTypes = types }
}

// WithMiddleware appends to the chain; each runs in order and may reject.
func WithMiddleware(middleware ...Middleware) RouteOption {
	return func(route *Route) {
		route.Middleware = append(route.Middleware, middleware...)
	}
}

// OnComplete registers the completion hook.
func OnComplete(hook CompleteHook) RouteOption {
	return func(route *Route) { route.OnComplete = hook }
}

// RequireCompletionToken makes the presign-issued token mandatory.
func RequireCompletionToken() RouteOption {
	return func(route *Route) { route.RequireCompletionToken = true }
}

// NewRoute builds a route from options.
func NewRoute(options ...RouteOption) Route {
	route := Route{}
	for _, option := range options {
		option(&route)
	}
	return route
}

// Image is shorthand for a route restricted to images.
func Image(options ...RouteOption) Route {
	return NewRoute(append([]RouteOption{AllowTypes("image/*")}, options...)...)
}

// File is a route with no type restriction.
func File(options ...RouteOption) Route {
	return NewRoute(options...)
}

// validate applies the route's constraints to a claimed file.
//
// Returns a message rather than an error because a constraint violation is a
// *per-file* outcome reported inside a 200, not a request failure — the rule
// most easily implemented backwards, and the one the conformance suite exists
// to pin down.
func (route Route) validate(file FileMeta) string {
	if route.MaxSize > 0 && file.Size > route.MaxSize {
		return fmt.Sprintf(
			"File size %s exceeds maximum %s",
			formatSize(file.Size), formatSize(route.MaxSize),
		)
	}

	if len(route.AllowTypes) == 0 {
		return ""
	}

	for _, allowed := range route.AllowTypes {
		if strings.HasSuffix(allowed, "/*") {
			if strings.HasPrefix(file.Type, strings.TrimSuffix(allowed, "*")) {
				return ""
			}
			continue
		}
		if file.Type == allowed {
			return ""
		}
	}

	return fmt.Sprintf("File type %s is not allowed", file.Type)
}

var sizeUnits = []struct {
	suffix string
	factor int64
}{
	{"TB", 1 << 40}, {"GB", 1 << 30}, {"MB", 1 << 20}, {"KB", 1 << 10}, {"B", 1},
}

func parseSize(size string) (int64, error) {
	normalized := strings.ToUpper(strings.TrimSpace(size))

	for _, unit := range sizeUnits {
		if !strings.HasSuffix(normalized, unit.suffix) {
			continue
		}
		value := strings.TrimSpace(strings.TrimSuffix(normalized, unit.suffix))
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return 0, err
		}
		return int64(parsed * float64(unit.factor)), nil
	}

	return 0, errors.New("missing unit (expected B, KB, MB, GB or TB)")
}

// formatSize matches the TypeScript wording, so the same violation reads the
// same to a user regardless of which server answered.
func formatSize(bytes int64) string {
	switch {
	case bytes >= 1<<30:
		return fmt.Sprintf("%.1fGB", float64(bytes)/float64(1<<30))
	case bytes >= 1<<20:
		return fmt.Sprintf("%.1fMB", float64(bytes)/float64(1<<20))
	case bytes >= 1<<10:
		return fmt.Sprintf("%.1fKB", float64(bytes)/float64(1<<10))
	default:
		return fmt.Sprintf("%dB", bytes)
	}
}
