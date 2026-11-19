/**
 * @fileoverview `Content-Disposition` values for downloads.
 *
 * Used both for the `response-content-disposition` parameter of a presigned
 * GET (the provider echoes it back as the header) and for the header of a
 * `Response` built on the server, so a filename is encoded the same way
 * whichever path serves the file.
 */

/** Whether the browser should display the file or save it. */
export type ContentDispositionType = "inline" | "attachment";

/**
 * Builds a `Content-Disposition` value per RFC 6266.
 *
 * A filename is emitted twice: `filename*=UTF-8''…` (RFC 5987) carries the
 * real name, and `filename="…"` is an ASCII fallback for clients that ignore
 * the extended form. Quotes, backslashes and control characters (CR/LF in
 * particular) are removed first — the filename is usually user-supplied, and
 * a line break in a header value is a response-splitting vector.
 *
 * @internal
 */
export function contentDisposition(
  type: ContentDispositionType,
  filename?: string
): string {
  const name = (filename ?? "").replace(/["\\\u0000-\u001f\u007f]/g, "");
  if (!name) return type;

  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

/**
 * `encodeURIComponent` leaves `'()*` and `!` unescaped; RFC 5987 `attr-char`
 * excludes `'()*`, so they are escaped as well.
 */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
