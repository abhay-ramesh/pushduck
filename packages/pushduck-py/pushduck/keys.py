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

    collapsed = []
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
