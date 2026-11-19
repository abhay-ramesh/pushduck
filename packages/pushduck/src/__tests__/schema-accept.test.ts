/**
 * @fileoverview What `accept` lets through, from every way of spelling it.
 *
 * `.accept()` and the `accept` constraint both mirror HTML `<input accept>`, so
 * apps declare the list once — usually `as const` — and hand the same array to
 * the route and to the file input. These pin down that the list is read the
 * same way whichever form it arrives in. The compile-time half (that a
 * readonly list is accepted at all) is in `readonly-arrays.test-d.ts`.
 */

import { describe, expect, it } from "vitest";
import { S3FileSchema, S3ImageSchema } from "../core/schema";

const LOGO_ACCEPT = ["image/png", "image/svg+xml"] as const;
const DOCUMENTS = [".pdf", ".docx"] as const;

function file(name: string, type: string): File {
  return new File(["x"], name, { type });
}

async function accepts(schema: S3FileSchema, input: File): Promise<boolean> {
  return (await schema.validate(input)).success;
}

describe("accept", () => {
  it("reads an `as const` MIME list on an image schema", async () => {
    const schema = new S3ImageSchema().accept(LOGO_ACCEPT);

    expect(await accepts(schema, file("logo.png", "image/png"))).toBe(true);
    expect(await accepts(schema, file("logo.svg", "image/svg+xml"))).toBe(true);
    expect(await accepts(schema, file("logo.gif", "image/gif"))).toBe(false);
  });

  it("reads an `as const` extension list on a file schema", async () => {
    const schema = new S3FileSchema().accept(DOCUMENTS);

    expect(await accepts(schema, file("a.pdf", "application/pdf"))).toBe(true);
    expect(await accepts(schema, file("a.txt", "text/plain"))).toBe(false);
  });

  it("reads the constraint the same way as the method", async () => {
    const viaMethod = new S3FileSchema().accept(DOCUMENTS);
    const viaConstraint = new S3FileSchema({ accept: DOCUMENTS });

    for (const input of [
      file("a.pdf", "application/pdf"),
      file("a.txt", "text/plain"),
    ]) {
      expect(await accepts(viaConstraint, input)).toBe(
        await accepts(viaMethod, input)
      );
    }
  });

  it("takes a single string", async () => {
    const schema = new S3FileSchema().accept("application/pdf");

    expect(await accepts(schema, file("a.pdf", "application/pdf"))).toBe(true);
    expect(await accepts(schema, file("a.png", "image/png"))).toBe(false);
  });

  it("leaves the MIME types alone when given only extensions", async () => {
    // Each side of the list replaces only the constraint it names, so adding
    // an extension rule does not silently drop an earlier type rule.
    const schema = new S3FileSchema()
      .accept(["application/pdf"])
      .accept([".pdf"]);

    expect(await accepts(schema, file("a.pdf", "application/pdf"))).toBe(true);
    expect(await accepts(schema, file("a.pdf", "text/plain"))).toBe(false);
  });
});
