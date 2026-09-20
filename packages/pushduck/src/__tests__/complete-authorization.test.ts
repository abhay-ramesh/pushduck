/**
 * @fileoverview `action=complete` must be authorised like every other action.
 *
 * The completion call is not a formality. It is where an application learns
 * that a file exists: `onUploadComplete` is where people insert the database
 * row, attach the file to a record, grant access to it, send the notification,
 * or bill for the storage. The docs show exactly that.
 *
 * Presign runs the route's middleware, so an unauthenticated caller cannot get
 * a URL. Multipart authorises every call against a signed session. Completion
 * did neither: it read `key` and `metadata` straight out of the request body
 * and invoked the hook. So a caller with no credentials at all could POST
 * `?action=complete` and drive an application's most consequential hook with
 * values they chose — a row claiming a file they never uploaded, attributed to
 * a user they are not, pointing at a key they do not own.
 *
 * These tests drive real HTTP through the handler, because the vulnerability is
 * reachable from the network and only visible there. A unit test on the router
 * method would describe the same code without demonstrating the exposure.
 */

import { describe, expect, it, vi } from "vitest";
import { createUploadConfig } from "../core/config/upload-config";
import { UploadError } from "../core/errors";

/** A router whose route requires a bearer token, as any real one would. */
function buildRouter(onUploadComplete = vi.fn()) {
  const { s3 } = createUploadConfig()
    .provider("aws", {
      bucket: "test-bucket",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    })
    .build();

  const middleware = vi.fn(async ({ req }: { req: Request }) => {
    if (req.headers.get("authorization") !== "Bearer valid-token") {
      throw new UploadError("UNAUTHORIZED", "Sign in to upload");
    }
    return { userId: "real-user" };
  });

  const router = s3.createRouter({
    imageUpload: s3
      .image()
      .maxFileSize("5MB")
      .middleware(middleware)
      .onUploadComplete(onUploadComplete),
  });

  return { router, middleware, onUploadComplete };
}

const FILE = { name: "photo.jpg", size: 1000, type: "image/jpeg" };

/**
 * Presign the way a real client does, and keep the token it was handed.
 *
 * Completion requires that token by default, so a test that hand-writes a key
 * is not exercising a shortcut — it is impersonating a caller who never
 * presigned, which is the request the server now refuses. Tests about
 * *middleware* authorization have to get past *object* authorization first.
 */
async function presigned(
  router: { handler: (request: Request) => Promise<Response> },
  count = 1
): Promise<Array<{ key: string; completionToken: string }>> {
  const response = await router.handler(
    new Request("http://localhost/api/upload?route=imageUpload&action=presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-token",
      },
      body: JSON.stringify({
        files: Array.from({ length: count }, () => FILE),
      }),
    })
  );

  const body = await response.json();
  return body.results.map((result: { key: string; completionToken: string }) => ({
    key: result.key,
    completionToken: result.completionToken,
  }));
}

function completeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(
    "http://localhost/api/upload?route=imageUpload&action=complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }
  );
}

describe("completion requires authorization", () => {
  it("rejects an unauthenticated completion", async () => {
    // The core exposure. No credentials, arbitrary key, arbitrary metadata.
    const { router, onUploadComplete } = buildRouter();

    const response = await router.handler(
      completeRequest({
        completions: [
          {
            key: "uploads/victim-user/private-document.pdf",
            file: FILE,
            metadata: { userId: "victim-user", plan: "enterprise" },
          },
        ],
      })
    );

    expect(response.status).toBe(401);
    // The hook is where the damage happens; it must not have run at all.
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("runs the completion hook for an authenticated caller", async () => {
    const { router, onUploadComplete } = buildRouter();
    const [issued] = await presigned(router);

    const response = await router.handler(
      completeRequest(
        {
          completions: [{ ...issued, file: FILE, metadata: {} }],
        },
        { authorization: "Bearer valid-token" }
      )
    );

    expect(response.status).toBe(200);
    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });

  it("runs the route's middleware on every completion", async () => {
    // Not merely "rejects when unauthenticated": the middleware chain is where
    // applications put rate limits, quota checks and audit logging, and it must
    // observe this call like any other.
    const { router, middleware } = buildRouter();
    const issued = await presigned(router, 2);
    middleware.mockClear(); // presign ran it too; this test is about completion

    await router.handler(
      completeRequest(
        {
          completions: issued.map((entry) => ({
            ...entry,
            file: FILE,
            metadata: {},
          })),
        },
        { authorization: "Bearer valid-token" }
      )
    );

    expect(middleware).toHaveBeenCalledTimes(2);
  });

  it("does not let the client dictate the metadata the hook receives", async () => {
    // Even an authenticated caller must not be able to assert who they are.
    // The middleware's output is authoritative, exactly as it is at presign.
    const onUploadComplete = vi.fn();
    const { router } = buildRouter(onUploadComplete);
    const [issued] = await presigned(router);

    await router.handler(
      completeRequest(
        {
          completions: [
            {
              ...issued,
              file: FILE,
              metadata: { userId: "someone-else", role: "admin" },
            },
          ],
        },
        { authorization: "Bearer valid-token" }
      )
    );

    expect(onUploadComplete).toHaveBeenCalledTimes(1);
    const [{ metadata }] = onUploadComplete.mock.calls[0];
    expect(metadata.userId).toBe("real-user");
    expect(metadata.role).toBeUndefined();
  });

  it("reports the failure as a typed 401 problem document", async () => {
    const { router } = buildRouter();

    const response = await router.handler(
      completeRequest({
        completions: [{ key: "uploads/x.jpg", file: FILE, metadata: {} }],
      })
    );

    const problem = await response.json();
    expect(problem.code).toBe("UNAUTHORIZED");
    expect(problem.status).toBe(401);
  });

  it("rejects the whole batch when any completion is unauthorised", async () => {
    // Partial application would leave the hook fired for some entries of a
    // request that was never allowed to happen.
    const { router, onUploadComplete } = buildRouter();

    await router.handler(
      completeRequest({
        completions: [
          { key: "uploads/a.jpg", file: FILE, metadata: {} },
          { key: "uploads/b.jpg", file: FILE, metadata: {} },
        ],
      })
    );

    expect(onUploadComplete).not.toHaveBeenCalled();
  });
});

describe("routes without middleware still complete", () => {
  it("completes without a caller, but not without a token", async () => {
    /**
     * A route with no middleware is explicitly public — nobody has to sign in.
     * That is a statement about the *caller*, not about the *object*: the route
     * still issues a completion token at presign and the client still returns
     * it, so requiring it costs a public route nothing and is the only thing
     * standing between "public upload route" and "anyone can claim any key in
     * the bucket was just uploaded".
     */
    const { s3 } = createUploadConfig()
      .provider("aws", {
        bucket: "test-bucket",
        region: "us-east-1",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      })
      .build();

    const onUploadComplete = vi.fn();
    const router = s3.createRouter({
      publicUpload: s3.image().maxFileSize("5MB").onUploadComplete(onUploadComplete),
    });

    const complete = (completions: unknown[]) =>
      router.handler(
        new Request(
          "http://localhost/api/upload?route=publicUpload&action=complete",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completions }),
          }
        )
      );

    // No credentials anywhere, and it works — because it presigned first.
    const issue = await router.handler(
      new Request(
        "http://localhost/api/upload?route=publicUpload&action=presign",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: [FILE] }),
        }
      )
    );
    const [issued] = (await issue.json()).results;

    const accepted = await complete([
      { key: issued.key, completionToken: issued.completionToken, file: FILE, metadata: {} },
    ]);

    expect(accepted.status).toBe(200);
    expect(onUploadComplete).toHaveBeenCalledTimes(1);

    // The same public route refuses a key that was never presigned.
    const refused = await complete([
      { key: "uploads/someone-elses.jpg", file: FILE, metadata: {} },
    ]);

    expect(refused.status).toBe(403);
    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });
});
