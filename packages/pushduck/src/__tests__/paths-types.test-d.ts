/**
 * @fileoverview `.paths()` callbacks see the middleware's output, typed.
 *
 * Apps built keys from `metadata` and re-cast it (`metadata as { userId:
 * string }`) in every route. The cast hid typos and went stale when middleware
 * changed. These checks fail to compile if `ctx.metadata` regresses to `any`.
 */

import { describe, expectTypeOf, it } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";

const { s3 } = createUploadConfig()
  .provider("aws", {
    bucket: "b",
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
  })
  .build();

describe(".paths() context", () => {
  it("types metadata as the middleware output in prefix, name and generateKey", () => {
    s3.image()
      .middleware(async () => ({ userId: "u1", orgId: 7 }))
      .paths({
        prefix: ({ metadata }) => {
          expectTypeOf(metadata).toEqualTypeOf<{ userId: string; orgId: number }>();
          // @ts-expect-error — not a field the middleware returns
          void metadata.tenantId;
          return `orgs/${metadata.orgId}/users/${metadata.userId}`;
        },
        name: ({ metadata, file }) => {
          expectTypeOf(metadata.userId).toEqualTypeOf<string>();
          return `${metadata.userId}-${file.name}`;
        },
      })
      .paths({
        generateKey: ({ metadata }) => {
          expectTypeOf(metadata).toEqualTypeOf<{ userId: string; orgId: number }>();
          return `x/${metadata.userId}`;
        },
      });
  });

  it("follows the last middleware in the chain", () => {
    s3.file()
      .middleware(async () => ({ userId: "u1" }))
      .middleware(async ({ metadata }) => ({ ...metadata, role: "admin" as const }))
      .paths({
        prefix: ({ metadata }) => {
          expectTypeOf(metadata).toEqualTypeOf<{ userId: string; role: "admin" }>();
          return metadata.role;
        },
      });
  });

  it("accepts the declarative forms and rejects anything else", () => {
    s3.file().paths({ prefix: "documents", name: "original" });
    s3.file().paths({ prefix: "documents/", name: "unique" });
    // @ts-expect-error — not a naming strategy
    s3.file().paths({ name: "random" });
    // @ts-expect-error — `suffix` was removed; use `name`
    s3.file().paths({ suffix: "processed" });
  });
});
