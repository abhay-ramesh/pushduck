/**
 * A consumer's server module, written the way apps write it: destructure the
 * build result and export everything with *inferred* types.
 *
 * Compiled with `declaration: true` by `declaration-consumer.test.ts`. Every
 * export here makes TypeScript print a pushduck type into the consumer's own
 * `.d.ts`; if that type is declared in a hashed chunk and not exported from a
 * public entry, the compiler cannot name it (TS2742) and the consumer is left
 * annotating `{ s3: any; config: any }` by hand.
 */
import { createUploadConfig } from "pushduck/server";

export const { s3, upload, storage, config } = createUploadConfig()
  .provider("cloudflareR2", {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "",
  })
  .defaults({ maxFileSize: "25MB", acl: "public-read" })
  .build();

export const router = upload.createRouter({
  avatar: upload
    .image()
    .maxFileSize("4MB")
    .middleware(async () => ({ userId: "user_1" }))
    .paths({ generateKey: ({ metadata }) => `avatars/${metadata.userId}` })
    .onUploadComplete(async ({ metadata }) => {
      void metadata.userId;
    }),
  document: upload.file().accept(["application/pdf"]),
  gallery: upload.image().maxFiles(6),
});

export type AppRouter = typeof router;

export const { GET, POST } = router.handlers;

export const builder = createUploadConfig();
export const imageSchema = upload.image().refine(async () => true, "never");
export const fileSchema = upload
  .file()
  .transform(async ({ file }) => file.name);
export const formSchema = upload.object({ cover: upload.image() });
export const defaults = config.defaults;
export const hooks = config.hooks;
export const provider = config.provider;
export const storageConfig = storage.getConfig();
export const providerInfo = storage.getProviderInfo();
export const listFiles = () => storage.list.files({ prefix: "avatars/" });
export const fileInfo = (key: string) => storage.metadata.getInfo(key);
export const presign = (key: string) => storage.upload.presignedUrl({ key });
export const removeFiles = (keys: string[]) => storage.delete.files(keys);
