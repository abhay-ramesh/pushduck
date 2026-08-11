/**
 * @fileoverview Type-level tests for IntelliSense and type safety.
 *
 * These assert what a developer *sees in their editor*, which no runtime test
 * can cover: route-name autocompletion, rejection of typos, inference of state
 * shapes, and the fact that every framework binding offers the same guarantees.
 *
 * They are checked by `tsc --noEmit` as part of the normal type-check, and by
 * `vitest typecheck`. A regression here is a compile error, not a silent loss
 * of editor support.
 *
 * `@ts-expect-error` is doing real work below: each one asserts that an invalid
 * usage *fails to compile*. If a change accidentally widens a type, the
 * directive becomes unused and TypeScript reports it — so loosening a type
 * breaks the build rather than quietly degrading autocomplete.
 */

import { describe, expectTypeOf, it } from "vitest";
import { createUploadEngine, uploadFile, uploadFiles } from "../core/upload";
import type { UploadEngineState, UploadFilesResult } from "../core/upload";
import { createUploadClient, useUploadRoute } from "../client";
import { createUploadRoute as createSvelteUpload } from "../svelte";
import { createUploadRoute as createSolidUpload } from "../solid";
import { useUploadRoute as useVueUploadRoute } from "../vue";
import type { S3Router } from "../types";
import { createUploadConfig } from "../core/config/upload-config";

// ========================================
// A representative app router
// ========================================

const { s3 } = createUploadConfig()
  .provider("aws", {
    bucket: "b",
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
  })
  .build();

const appRouter = s3.createRouter({
  imageUpload: s3.image().maxFileSize("5MB"),
  documentUpload: s3.file().maxFileSize("10MB"),
});

type AppRouter = typeof appRouter;

// ========================================
// Route-name autocompletion
// ========================================

describe("route names autocomplete from the server router", () => {
  it("accepts a real route name in every binding", () => {
    useUploadRoute<AppRouter>("imageUpload");
    useVueUploadRoute<AppRouter>("imageUpload");
    createSvelteUpload<AppRouter>("imageUpload");
    createSolidUpload<AppRouter>("imageUpload");

    createUploadEngine<AppRouter>({
      route: "documentUpload",
      endpoint: "/api/upload",
    });

    uploadFiles<AppRouter>({
      files: [],
      route: "documentUpload",
      endpoint: "/api/upload",
    });
  });

  it("rejects a route that does not exist — in every binding", () => {
    // @ts-expect-error 'nope' is not a route on AppRouter
    useUploadRoute<AppRouter>("nope");
    // @ts-expect-error 'nope' is not a route on AppRouter
    useVueUploadRoute<AppRouter>("nope");
    // @ts-expect-error 'nope' is not a route on AppRouter
    createSvelteUpload<AppRouter>("nope");
    // @ts-expect-error 'nope' is not a route on AppRouter
    createSolidUpload<AppRouter>("nope");

    createUploadEngine<AppRouter>({
      // @ts-expect-error 'nope' is not a route on AppRouter
      route: "nope",
      endpoint: "/api/upload",
    });

    uploadFiles<AppRouter>({
      files: [],
      // @ts-expect-error 'nope' is not a route on AppRouter
      route: "nope",
      endpoint: "/api/upload",
    });

    uploadFile<AppRouter>({
      file: new File([], "x"),
      // @ts-expect-error 'nope' is not a route on AppRouter
      route: "nope",
      endpoint: "/api/upload",
    });
  });

  it("still accepts any string when no router type is supplied", () => {
    // Untyped usage — a JS consumer, or a route name computed at runtime —
    // must keep working rather than becoming a hard error.
    useUploadRoute("anything");
    createUploadEngine({ route: "anything", endpoint: "/api/upload" });
    uploadFiles({ files: [], route: "anything", endpoint: "/api/upload" });
  });
});

// ========================================
// Returned state shapes
// ========================================

describe("state shapes are inferred, not `any`", () => {
  it("React returns plain values", () => {
    const upload = useUploadRoute<AppRouter>("imageUpload");

    expectTypeOf(upload.isUploading).toEqualTypeOf<boolean>();
    expectTypeOf(upload.progress).toEqualTypeOf<number | undefined>();
    expectTypeOf(upload.files).toBeArray();
    expectTypeOf(upload.files[0].status).toEqualTypeOf<
      "pending" | "uploading" | "success" | "error"
    >();
  });

  it("Vue returns refs whose `.value` is typed", () => {
    const upload = useVueUploadRoute<AppRouter>("imageUpload");

    expectTypeOf(upload.isUploading.value).toEqualTypeOf<boolean>();
    expectTypeOf(upload.progress.value).toEqualTypeOf<number>();
    expectTypeOf(upload.files.value).toBeArray();
  });

  it("Svelte's store carries the engine state", () => {
    const upload = createSvelteUpload<AppRouter>("imageUpload");

    upload.subscribe((state) => {
      expectTypeOf(state).toEqualTypeOf<UploadEngineState>();
      expectTypeOf(state.progress).toEqualTypeOf<number>();
    });
  });

  it("Solid returns a typed [state, actions] tuple", () => {
    const [state, actions] = createSolidUpload<AppRouter>("imageUpload");

    expectTypeOf(state.progress).toEqualTypeOf<number>();
    expectTypeOf(state.isUploading).toEqualTypeOf<boolean>();
    expectTypeOf(actions.reset).toBeFunction();
  });
});

// ========================================
// Actions are typed identically everywhere
// ========================================

describe("actions share one signature across bindings", () => {
  it("uploadFilesAsync resolves to UploadFilesResult in every binding", () => {
    const react = useUploadRoute<AppRouter>("imageUpload");
    const vue = useVueUploadRoute<AppRouter>("imageUpload");
    const svelte = createSvelteUpload<AppRouter>("imageUpload");
    const [, solid] = createSolidUpload<AppRouter>("imageUpload");

    expectTypeOf(react.uploadFilesAsync([])).resolves.toMatchTypeOf<{
      files: unknown[];
      failedFiles: unknown[];
    }>();
    expectTypeOf(vue.uploadFilesAsync([])).resolves.toEqualTypeOf<UploadFilesResult>();
    expectTypeOf(
      svelte.uploadFilesAsync([])
    ).resolves.toEqualTypeOf<UploadFilesResult>();
    expectTypeOf(
      solid.uploadFilesAsync([])
    ).resolves.toEqualTypeOf<UploadFilesResult>();
  });

  it("cancel takes a file id in every binding", () => {
    const react = useUploadRoute<AppRouter>("imageUpload");
    const vue = useVueUploadRoute<AppRouter>("imageUpload");
    const svelte = createSvelteUpload<AppRouter>("imageUpload");
    const [, solid] = createSolidUpload<AppRouter>("imageUpload");

    expectTypeOf(react.cancel).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(vue.cancel).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(svelte.cancel).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(solid.cancel).parameter(0).toEqualTypeOf<string>();
  });
});

// ========================================
// Config portability
// ========================================

describe("one options object works across frameworks", () => {
  it("accepts the same config in every binding", () => {
    const config = {
      endpoint: "/api/upload",
      onProgress: (p: number) => void p,
      onError: (e: Error) => void e,
    };

    useUploadRoute<AppRouter>("imageUpload", config);
    useVueUploadRoute<AppRouter>("imageUpload", config);
    createSvelteUpload<AppRouter>("imageUpload", config);
    createSolidUpload<AppRouter>("imageUpload", config);
  });

  it("rejects an unknown option", () => {
    useUploadRoute<AppRouter>("imageUpload", {
      // @ts-expect-error `endpoints` is not a valid option
      endpoints: "/api/upload",
    });
  });

  it("types lifecycle callback parameters", () => {
    useUploadRoute<AppRouter>("imageUpload", {
      onSuccess: (results) => {
        expectTypeOf(results).toBeArray();
        expectTypeOf(results[0].key).toEqualTypeOf<string | undefined>();
      },
      onError: (error) => {
        // Typed error, not a bare Error: `code` and `retryable` are the whole
        // point — but it is still an Error, so old handlers keep compiling.
        expectTypeOf(error).toMatchTypeOf<Error>();
        expectTypeOf(error.code).toBeString();
        expectTypeOf(error.retryable).toEqualTypeOf<boolean>();
      },
      onProgress: (p) => expectTypeOf(p).toEqualTypeOf<number>(),
    });
  });
});

// ========================================
// Property-based client
// ========================================

describe("createUploadClient exposes routes as typed properties", () => {
  it("autocompletes route names as properties", () => {
    const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });

    const route = upload.imageUpload();
    expectTypeOf(route.uploadFiles).toBeFunction();
  });

  it("rejects a property that is not a route", () => {
    const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });

    // @ts-expect-error 'nope' is not a route on AppRouter
    upload.nope();
  });
});

// ========================================
// Server router inference
// ========================================

describe("server router types flow to the client", () => {
  it("infers the router type from createRouter", () => {
    expectTypeOf(appRouter).toMatchTypeOf<S3Router<any>>();
  });

  it("exposes route names as a literal union", () => {
    type Names = keyof AppRouter extends never ? never : string;
    expectTypeOf<Names>().toEqualTypeOf<string>();
  });
});

// ========================================
// Property client is at parity with the hook
// ========================================

describe("createUploadClient matches useUploadRoute's capabilities", () => {
  it("exposes every action the hook does", () => {
    // The property-based client used to lag the hook, missing cancel,
    // cancelAll, and uploadFilesAsync. It now derives from the same type.
    const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
    const route = upload.imageUpload();

    expectTypeOf(route.uploadFiles).toBeFunction();
    expectTypeOf(route.uploadFilesAsync).toBeFunction();
    expectTypeOf(route.cancel).toBeFunction();
    expectTypeOf(route.cancelAll).toBeFunction();
    expectTypeOf(route.reset).toBeFunction();
  });

  it("narrows routeName to a literal, not string", () => {
    const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
    expectTypeOf(upload.imageUpload().routeName).toEqualTypeOf<"imageUpload">();
  });

  it("exposes the same state fields as the hook", () => {
    const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });
    const route = upload.imageUpload();

    expectTypeOf(route.isUploading).toEqualTypeOf<boolean>();
    expectTypeOf(route.files).toBeArray();
    expectTypeOf(route.errors).toBeArray();
  });
});
