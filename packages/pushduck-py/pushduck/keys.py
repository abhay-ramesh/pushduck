"""Object key generation.

Ported behaviour-for-behaviour from the TypeScript implementation, including
the fix that motivated rewriting it there. Replacing every character outside
``[a-zA-Z0-9.-]`` erases any name written in a non-Latin script, so
``文档.pdf``, ``写真.pdf`` and ``Отчёт.pdf`` all collapsed to ``.pdf`` and
silently overwrote one another.

S3 keys are UTF-8 strings, so the fix is to stop mangling the name. Only
characters dangerous in a *key* are removed: path separators, which would move
the object; control and bidi-override characters, which do not belong in a
header; and the URL delimiters that change how a key parses.
"""

from __future__ import annotations

import unicodedata

#: Leaves room below S3's 1024-byte limit for a prefix or suffix. The limit is
#: on *bytes*, and a CJK character costs three, so a name far shorter than 1024
#: characters can exceed it.
MAX_KEY_BYTES = 900

_BIDI_AND_INVISIBLE = frozenset(
    list(range(0x200B, 0x2010))  # zero-width and directional marks
    + list(range(0x202A, 0x202F))  # bidi overrides used for filename spoofing
    + list(range(0x2066, 0x206A))
    + [0xFEFF]
)


def _is_dangerous(char: str) -> bool:
    if unicodedata.category(char) in ("Cc", "Cf") and ord(char) not in (0x200D,):
        return True
    return ord(char) in _BIDI_AND_INVISIBLE


def _basename(name: str) -> str:
    """The part before the extension.

    A dot at index 0 means the whole name *is* an extension-like tail —
    ``.gitignore``, or the ``.pdf`` left when a name is stripped away — so the
    basename is empty rather than the entire string. That distinction separates
    a legitimately dot-leading name from an erased one.
    """
    dot = name.rfind(".")
    if dot == -1:
        return name
    if dot == 0:
        return ""
    return name[:dot]


def _fingerprint(name: str) -> str:
    """FNV-1a. Not cryptographic and does not need to be — it exists to keep
    keys distinct, not to resist an attacker."""
    value = 0x811C9DC5
    for char in name:
        value ^= ord(char) & 0xFFFFFFFF
        value = (value * 0x01000193) & 0xFFFFFFFF
    return format(value, "x")


def generate_key(original_name: str) -> str:
    """Sanitise a filename into an object key."""
    if not original_name:
        return "file"

    out = []
    for char in original_name:
        if _is_dangerous(char):
            # Dropped rather than substituted: an underscore here would be
            # indistinguishable from one the user typed.
            continue
        if ord(char) < 0x80:
            # ASCII keeps the original allow-list exactly, so every key a
            # deployment already stores is unchanged.
            out.append(char if (char.isalnum() and char.isascii()) or char in ".-" else "_")
        else:
            # Everything above U+007F is kept. This is the fix.
            out.append(char)

    name = "".join(out)

    collapsed: list[str] = []
    for char in name:
        if char == "_" and collapsed and collapsed[-1] == "_":
            continue
        collapsed.append(char)
    name = "".join(collapsed).strip("_")

    encoded = name.encode("utf-8")
    if len(encoded) > MAX_KEY_BYTES:
        # Truncated on a character boundary, keeping the tail as well as the
        # head so two names sharing a long prefix stay distinct.
        head = encoded[: MAX_KEY_BYTES - 64].decode("utf-8", errors="ignore")
        name = head + name[-24:]

    # Every character was stripped — a name of only separators. A stable
    # fingerprint keeps two such names apart, where a shared constant would
    # reintroduce the collision this function exists to prevent.
    if not _basename(name) and _basename(original_name):
        name = f"file-{_fingerprint(original_name)}{name}"

    if not name or not name.strip("._"):
        name = f"file-{_fingerprint(original_name)}"

    return name


# ─── the chokepoint ──────────────────────────────────────────────────────────

#: S3's hard limit. The `key` channel returns a fragment; the library is what
#: guarantees the result is a legal key, so the check belongs here.
MAX_TOTAL_KEY_BYTES = 1024

_REJECTED_CHARS = frozenset("?#%")


def resolve_key(fragment: str, original_name: str) -> str:
    """Turn a ``key`` channel's return value into an object key.

    The channel returns a *fragment*. This function owns the result: it refuses
    anything that cannot be made safe, and re-sanitises every segment of what
    is left through :func:`generate_key`.

    Both halves matter. Refusing traversal is the obvious one. Re-sanitising is
    the half that is easy to skip and expensive to skip: without it, the
    non-Latin filename handling above applies only to the *default* key, and is
    bypassed entirely the moment an application supplies its own — so
    ``文档.pdf`` and ``写真.pdf`` would start colliding again for exactly the
    users who customised their keys.

    Django arrived at the same arrangement the hard way. CVE-2024-39330 was a
    ``Storage`` subclass overriding ``generate_filename`` without replicating
    the parent's validation; the fix moved the checks into ``Storage.save`` so
    that no override can bypass them. Rails (CVE-2026-33173) and Uppy — which
    renamed its old default ``unsafeGetKey`` — both relocated the guarantee
    rather than documenting the hazard.

    Raises ``CONFIG_INVALID`` rather than a 4xx: a key hook returning ``..`` is
    a bug in the application, not a malformed request from its caller.
    """
    from .errors import UploadError

    def reject(why: str) -> "UploadError":
        return UploadError(
            "CONFIG_INVALID",
            f"the `key` channel returned {fragment!r}, which {why}. "
            "Return a path fragment; pushduck adds the prefix and sanitises it.",
        )

    if not isinstance(fragment, str):
        raise UploadError(
            "CONFIG_INVALID",
            f"the `key` channel returned {type(fragment).__name__}, expected a string",
        )

    if not fragment:
        raise reject("is empty")

    if fragment.startswith("/"):
        # An absolute-looking key is not an error in S3 — it creates an object
        # whose name begins with a slash, which is almost never intended and
        # breaks every URL built by concatenation.
        raise reject("is absolute")

    for char in fragment:
        if char in _REJECTED_CHARS:
            raise reject(f"contains {char!r}, which changes how the key parses in a URL")
        if _is_dangerous(char):
            # Stripped silently by `generate_key` for a *filename*, because
            # there the alternative is rejecting the user's upload. In a key the
            # application chose, silently returning something other than what
            # was asked for is the worse failure.
            raise reject(f"contains U+{ord(char):04X}, a control or bidi character")

    segments = fragment.split("/")
    for segment in segments:
        if segment in ("", ".", ".."):
            raise reject("contains an empty, '.' or '..' segment")

    # Each segment goes through the same sanitiser the default path uses, so a
    # custom key cannot opt out of the Unicode handling above.
    resolved = "/".join(generate_key(segment) for segment in segments)

    if len(resolved.encode("utf-8")) > MAX_TOTAL_KEY_BYTES:
        raise reject(f"exceeds S3's {MAX_TOTAL_KEY_BYTES}-byte key limit once sanitised")

    return resolved
