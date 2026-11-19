/**
 * @fileoverview Builder methods accept readonly arrays.
 *
 * Apps declare their accepted types once, `as const`, and share the list
 * between the server route and the `<input accept>` on the client. A
 * parameter typed `string[]` rejects that list — a readonly tuple is not
 * assignable to a mutable array — so a real app had to write
 *
 *   .accept(LOGO_ACCEPT as unknown as Parameters<...["accept"]>[0])
 *
 * pushduck never mutates these lists, so every array a builder takes is
 * declared `readonly`. The `@ts-expect-error`-free calls below are the test:
 * each fails to compile if a parameter regresses to a mutable array.
 */

import { describe, expectTypeOf, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { S3FileSchema, S3ImageSchema } from "../core/schema";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const DOCUMENT_EXTENSIONS = [".pdf", ".docx"] as const;
const LEGACY_EXTENSIONS = ["pdf", "docx"] as const;
const FORMATS = ["png", "webp"] as const;

const { upload } = createUploadConfig()
  .provider("aws", {
    bucket: "b",
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
  })
  .build();

describe("readonly arrays in schema builders", () => {
  it("accept() takes an `as const` list on file and image schemas", () => {
    expectTypeOf(upload.file().accept(DOCUMENT_EXTENSIONS)).toEqualTypeOf<S3FileSchema>();
    expectTypeOf(upload.image().accept(IMAGE_TYPES)).toEqualTypeOf<S3ImageSchema>();
  });

  it("the accept constraint takes an `as const` list", () => {
    upload.file({ accept: DOCUMENT_EXTENSIONS });
    upload.image({ accept: IMAGE_TYPES });
    upload.file({
      allowedTypes: IMAGE_TYPES,
      allowedExtensions: LEGACY_EXTENSIONS,
    });
  });

  it("the deprecated array methods take an `as const` list too", () => {
    upload.file().types(IMAGE_TYPES);
    upload.file().extensions(LEGACY_EXTENSIONS);
    upload.image().types(IMAGE_TYPES);
    upload.image().extensions(LEGACY_EXTENSIONS);
    upload.image().formats(FORMATS);
  });
});

describe("readonly arrays in config builders", () => {
  it("defaults and security take `as const` lists", () => {
    createUploadConfig()
      .defaults({ allowedFileTypes: IMAGE_TYPES })
      .security({ allowedOrigins: ["https://app.example"] as const });
  });
});
