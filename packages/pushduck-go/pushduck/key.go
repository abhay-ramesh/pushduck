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
	"strings"
	"unicode"
	"unicode/utf8"
)

// maxKeyBytes leaves room below S3's 1024-byte limit for a prefix or suffix.
// The limit is on *bytes*: a CJK character costs three, so a name far shorter
// than 1024 characters can exceed it.
const maxKeyBytes = 900

func isDangerous(r rune) bool {
	switch {
	case unicode.IsControl(r):
		return true
	case r >= 0x200B && r <= 0x200F, // zero-width and directional marks
		r >= 0x202A && r <= 0x202E, // bidi overrides used for filename spoofing
		r >= 0x2066 && r <= 0x2069,
		r == 0xFEFF:
		return true
	default:
		return false
	}
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

// fingerprint is FNV-1a: not cryptographic, and does not need to be. It exists
// to keep keys distinct, not to resist an attacker.
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
