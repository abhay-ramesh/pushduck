/**
 * @fileoverview Shape matching for conformance fixtures.
 *
 * A conformance fixture cannot compare responses by equality. A presigned URL
 * carries a signature, a timestamp and a credential scope; a key carries
 * whatever the implementation's key generator produced. Demanding equality
 * would specify things the protocol deliberately leaves to the implementation.
 *
 * So an expectation is a *pattern*: literals must match, structure is matched
 * recursively, and a small set of matchers covers the parts that legitimately
 * vary. Unlisted keys are ignored, which is what lets the protocol grow
 * optional fields — `completionToken`, the observability headers — without
 * invalidating every fixture.
 *
 * Failures report the JSON path, because a conformance failure is read by
 * someone implementing in another language who cannot see this code.
 */

/** A mismatch, located. */
export interface Mismatch {
  /** JSON path, e.g. `results[0].presignedUrl`. */
  path: string;
  expected: string;
  actual: string;
}

const MATCHER_KEYS = new Set([
  "$type",
  "$contains",
  "$matches",
  "$absent",
  "$any",
]);

function isMatcher(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    MATCHER_KEYS.has(Object.keys(value)[0])
  );
}

function describe(value: unknown): string {
  if (value === undefined) return "absent";
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value) ?? String(value);
}

/** JSON type name, as used by `$type`. */
function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function applyMatcher(
  matcher: Record<string, unknown>,
  actual: unknown,
  path: string,
  out: Mismatch[]
): void {
  const [key] = Object.keys(matcher);
  const operand = matcher[key];

  switch (key) {
    case "$absent":
      // Absent and explicitly null are the same thing to a consumer, and JSON
      // encoders differ on which they emit for an unset optional field.
      if (actual !== undefined && actual !== null) {
        out.push({ path, expected: "absent", actual: describe(actual) });
      }
      return;

    case "$any":
      if (actual === undefined) {
        out.push({ path, expected: "any value", actual: "absent" });
      }
      return;

    case "$type":
      if (jsonType(actual) !== operand) {
        out.push({
          path,
          expected: `type ${String(operand)}`,
          actual: `type ${jsonType(actual)}`,
        });
      }
      return;

    case "$contains":
      if (typeof actual !== "string" || !actual.includes(String(operand))) {
        out.push({
          path,
          expected: `string containing ${describe(operand)}`,
          actual: describe(actual),
        });
      }
      return;

    case "$matches":
      if (
        typeof actual !== "string" ||
        !new RegExp(String(operand)).test(actual)
      ) {
        out.push({
          path,
          expected: `string matching /${String(operand)}/`,
          actual: describe(actual),
        });
      }
      return;

    default:
      // Unreachable while MATCHER_KEYS and this switch agree; kept so that
      // adding a key to one without the other fails loudly rather than
      // silently passing every fixture that uses it.
      out.push({
        path,
        expected: `a known matcher, got ${key}`,
        actual: describe(actual),
      });
  }
}

/**
 * Collects every way `actual` fails to satisfy `expected`.
 *
 * Returns all mismatches rather than the first, so an implementer sees the
 * whole picture from one run instead of fixing one field at a time.
 */
export function match(
  expected: unknown,
  actual: unknown,
  path = ""
): Mismatch[] {
  const out: Mismatch[] = [];

  if (isMatcher(expected)) {
    applyMatcher(expected as Record<string, unknown>, actual, path || "$", out);
    return out;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      out.push({
        path: path || "$",
        expected: `array of ${expected.length}`,
        actual: describe(actual),
      });
      return out;
    }

    // Length is asserted because `results` aligns positionally with the
    // request's `files`; a shorter array is a specification violation, not a
    // detail.
    if (actual.length !== expected.length) {
      out.push({
        path: path || "$",
        expected: `array of ${expected.length}`,
        actual: `array of ${actual.length}`,
      });
    }

    expected.forEach((item, index) => {
      out.push(...match(item, actual[index], `${path}[${index}]`));
    });
    return out;
  }

  if (typeof expected === "object" && expected !== null) {
    if (typeof actual !== "object" || actual === null || Array.isArray(actual)) {
      out.push({
        path: path || "$",
        expected: "object",
        actual: describe(actual),
      });
      return out;
    }

    for (const [key, value] of Object.entries(expected)) {
      const child = path ? `${path}.${key}` : key;
      out.push(...match(value, (actual as Record<string, unknown>)[key], child));
    }
    return out;
  }

  if (expected !== actual) {
    out.push({
      path: path || "$",
      expected: describe(expected),
      actual: describe(actual),
    });
  }

  return out;
}
