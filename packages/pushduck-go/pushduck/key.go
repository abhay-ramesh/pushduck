package pushduck

// Object key generation.
//
// Ported behaviour-for-behaviour from the TypeScript implementation, including
// the fix that motivated rewriting it there: replacing every character outside
// `[a-zA-Z0-9.-]` erases any name written in a non-Latin script, so `文档.pdf`,
// `写真.pdf` and `Отчёт.pdf` all collapsed to `.pdf` and silently overwrote one
// another.
//
// S3 keys are UTF-8 strings, so the fix is to stop mangling the name. Only
// characters that are dangerous in a *key* are removed: path separators, which
// would move the object; control and bidi-override characters, which do not
// belong in a header; and the URL delimiters that change how a key parses.

import (
	"fmt"
	"hash/fnv"
	"net/http"
	"strings"
	"unicode"
	"unicode/utf8"
)

// maxKeyBytes leaves room below S3's 1024-byte limit for a prefix or suffix.
// The limit is on *bytes*: a CJK character costs three, so a name far shorter
// than 1024 characters can exceed it.
const maxKeyBytes = 900

// isDangerous reports control characters (C0 and C1) and every Unicode format
// character (general category Cf): bidi overrides, zero-width characters, the
// soft hyphen, the word joiner. A category rather than a hand-kept list, so the
// TypeScript and Python implementations, which use the same one, cannot drift.
func isDangerous(r rune) bool {
	return unicode.IsControl(r) || unicode.Is(unicode.Cf, r)
}

// generateKey sanitises a filename into an object key.
func generateKey(originalName string) string {
	if originalName == "" {
		return "file"
	}

	var b strings.Builder
	for _, r := range originalName {
		switch {
		case isDangerous(r):
			// Dropped entirely rather than substituted: an underscore here
			// would be indistinguishable from one the user typed.
			continue
		case r < utf8.RuneSelf:
			// ASCII keeps the original allow-list exactly, so every key a
			// deployment already stores is unchanged.
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
				(r >= '0' && r <= '9') || r == '.' || r == '-' {
				b.WriteRune(r)
			} else {
				b.WriteByte('_')
			}
		default:
			// Everything above U+007F is kept. This is the fix.
			b.WriteRune(r)
		}
	}

	name := collapseUnderscores(b.String())
	name = strings.Trim(name, "_")

	if len(name) > maxKeyBytes {
		// Truncated on a rune boundary, keeping the tail as well as the head so
		// two names sharing a long prefix stay distinct.
		head := truncateRunes(name, maxKeyBytes-64)
		tail := lastRunes(name, 24)
		name = head + tail
	}

	// Every character was stripped — a name of only separators. Substituting a
	// stable fingerprint keeps two such names apart, where a shared constant
	// would reintroduce the collision this function exists to prevent.
	if basename(name) == "" && basename(originalName) != "" {
		name = fmt.Sprintf("file-%s%s", fingerprint(originalName), name)
	}

	if name == "" || strings.Trim(name, "._") == "" {
		name = "file-" + fingerprint(originalName)
	}

	return name
}

func collapseUnderscores(s string) string {
	var b strings.Builder
	previousUnderscore := false

	for _, r := range s {
		if r == '_' {
			if previousUnderscore {
				continue
			}
			previousUnderscore = true
		} else {
			previousUnderscore = false
		}
		b.WriteRune(r)
	}

	return b.String()
}

// basename is the part before the extension.
//
// A dot at index 0 means the whole name *is* an extension-like tail —
// `.gitignore`, or the `.pdf` left when a name is stripped away — so the
// basename is empty rather than the entire string. That distinction separates
// a legitimately dot-leading name from an erased one.
func basename(name string) string {
	dot := strings.LastIndex(name, ".")
	switch dot {
	case -1:
		return name
	case 0:
		return ""
	default:
		return name[:dot]
	}
}

// fingerprint is FNV-1a over the UTF-8 bytes, in hex — the same function as
// the TypeScript and Python servers', so a name gets the same key whichever
// server answers. Not cryptographic, and does not need to be: it exists to keep
// keys distinct, not to resist an attacker.
func fingerprint(name string) string {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(name))
	return fmt.Sprintf("%x", hash.Sum32())
}

func truncateRunes(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	truncated := s[:maxBytes]
	for !utf8.ValidString(truncated) && len(truncated) > 0 {
		truncated = truncated[:len(truncated)-1]
	}
	return truncated
}

func lastRunes(s string, count int) string {
	runes := []rune(s)
	if len(runes) <= count {
		return s
	}
	return string(runes[len(runes)-count:])
}

// ─── the chokepoint ─────────────────────────────────────────────────────────

// maxTotalKeyBytes is S3's hard limit. A StoragePath hook returns a fragment;
// the library is what guarantees the result is a legal key, so the check
// belongs here rather than in every application's hook.
const maxTotalKeyBytes = 1024

// objectKey mints the key for one file. Every place that creates an object —
// single PUT presign and multipart init — goes through here, so the
// completion token always binds the key the hook chose.
//
// A hook's own error is returned as it is, so a hook can still fail the whole
// request (UNAUTHORIZED, say). A fragment resolveKey refuses comes back as a
// *keyRefusal, which callers report against the one file.
func (route Route) objectKey(r *http.Request, file FileMeta) (string, error) {
	if route.StoragePath == nil {
		return generateKey(file.Name), nil
	}

	fragment, err := route.StoragePath(r, file)
	if err != nil {
		return "", err
	}
	key, err := resolveKey(fragment)
	if err != nil {
		return "", keyRefusal{err.(*Error)}
	}
	return key, nil
}

// keyRefusal marks a key resolveKey refused, as distinct from an error the
// StoragePath hook returned itself. Only the refusal is a per-file outcome.
type keyRefusal struct{ refused *Error }

func (k keyRefusal) Error() string { return k.refused.Error() }
func (k keyRefusal) Unwrap() error { return k.refused }

// resolveKey turns a StoragePath hook's return value into an object key.
//
// Ported from Python's `resolve_key`. It refuses anything that cannot be made
// safe, then re-sanitises every segment of what is left through generateKey.
//
// Both halves matter. Refusing traversal is the obvious one. Re-sanitising is
// the half that is easy to skip: without it, the non-Latin filename handling
// above protects only the *default* key, and `文档.pdf` and `写真.pdf` would
// start colliding again for exactly the deployments that customised their
// keys.
//
// Returns VALIDATION_FAILED, which fails the one file whose key it was while
// the rest of the batch continues — as the TypeScript and Python servers do. A
// key is usually built from a value the caller influences (a filename, a
// folder), so the refusal belongs to that file, not to the request.
func resolveKey(fragment string) (string, error) {
	reject := func(why string) error {
		return NewError("VALIDATION_FAILED", fmt.Sprintf(
			"the StoragePath hook returned %q, which %s. "+
				"Return a path fragment; pushduck sanitises each segment.",
			fragment, why,
		))
	}

	if fragment == "" {
		return "", reject("is empty")
	}

	if strings.HasPrefix(fragment, "/") {
		// Legal in S3 — it creates an object whose name begins with a slash —
		// but almost never intended, and it breaks every URL built by
		// concatenation.
		return "", reject("is absolute")
	}

	if !utf8.ValidString(fragment) {
		return "", reject("is not valid UTF-8")
	}

	for _, r := range fragment {
		if r == '?' || r == '#' || r == '%' {
			return "", reject(fmt.Sprintf("contains %q, which changes how the key parses in a URL", r))
		}
		if isDangerous(r) {
			// Stripped silently by generateKey for a *filename*, because there
			// the alternative is rejecting the user's upload. In a key the
			// application chose, silently storing something other than what
			// was asked for is the worse failure.
			return "", reject(fmt.Sprintf("contains U+%04X, a control or format character", r))
		}
	}

	segments := strings.Split(fragment, "/")
	for index, segment := range segments {
		if segment == "" || segment == "." || segment == ".." {
			return "", reject("contains an empty, '.' or '..' segment")
		}
		// The same sanitiser the default path uses, so a custom key cannot opt
		// out of the Unicode handling above.
		segments[index] = generateKey(segment)
	}

	resolved := strings.Join(segments, "/")
	if len(resolved) > maxTotalKeyBytes {
		return "", reject(fmt.Sprintf("exceeds S3's %d-byte key limit once sanitised", maxTotalKeyBytes))
	}

	return resolved, nil
}
