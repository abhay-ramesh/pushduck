// @vitest-environment happy-dom

/**
 * @fileoverview The Svelte binding inside a real compiled component.
 *
 * `svelte-binding.test.ts` calls `subscribe()` by hand and asserts the store
 * contract. That is necessary but not sufficient: what users actually write is
 * `$upload`, and auto-subscription is **compiler output**. The compiler decides
 * whether the returned object is store-shaped, when it reads it, and when it
 * re-renders — none of which a hand-written `subscribe()` call exercises.
 *
 * So this suite compiles a component that uses `$upload` the way the docs show,
 * mounts it, and asserts against the DOM. A store that satisfies the interface
 * but not the compiler's expectations fails here and nowhere else.
 *
 * What it does *not* cover is subscription release — see the note on the
 * teardown test. That belongs to the binding suite, which can observe the
 * engine directly.
 */

import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { UploadClientConfig } from "../core/upload";
import Uploader from "./fixtures/Uploader.svelte";

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function createFetcher(
  options: { fail?: boolean } = {}
): NonNullable<UploadClientConfig["fetcher"]> {
  return vi.fn(async (input: RequestInfo) => {
    if (options.fail) {
      return new Response(
        JSON.stringify({
          type: "https://pushduck.dev/errors/forbidden",
          title: "Forbidden",
          status: 403,
          code: "FORBIDDEN",
          detail: "Not allowed",
        }),
        { status: 403, headers: { "Content-Type": "application/problem+json" } }
      );
    }

    const payload = String(input).includes("action=presign")
      ? {
          success: true,
          results: [
            {
              success: true,
              presignedUrl: "https://bucket.s3.amazonaws.com/signed",
              key: "uploads/photo.jpg",
              requiredHeaders: { "Content-Type": "image/jpeg" },
            },
          ],
        }
      : {
          success: true,
          results: [
            {
              success: true,
              key: "uploads/photo.jpg",
              url: "https://cdn.example.com/uploads/photo.jpg",
            },
          ],
        };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

const noopTransport = async () => {};

/** Mounts the fixture and returns its host element and exported controls. */
function render(fetcher = createFetcher()) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const component = mount(Uploader, {
    target,
    props: {
      config: {
        endpoint: "/api/upload",
        fetcher,
        transport: noopTransport,
      } as UploadClientConfig,
    },
  });

  return {
    target,
    component,
    text: (selector: string) => target.querySelector(selector)?.textContent,
    all: (selector: string) => [...target.querySelectorAll(selector)],
    destroy: () => {
      unmount(component);
      target.remove();
    },
  };
}

describe("Svelte binding in a mounted component", () => {
  it("renders through $upload auto-subscription", async () => {
    const view = render();

    expect(view.text(".status")).toBe("false");
    expect(view.text(".count")).toBe("0");

    await view.component.uploadFiles([makeFile()]);
    flushSync();

    // The rendered DOM, not the store's value — this is what the compiler
    // produced from `$upload`.
    expect(view.all("li")).toHaveLength(1);
    expect(view.all("li")[0].textContent).toBe("photo.jpg:success");
    expect(view.text(".count")).toBe("1");
    expect(view.text(".status")).toBe("false");
    expect(view.target.querySelector("progress")?.getAttribute("value")).toBe(
      "100"
    );

    view.destroy();
  });

  it("re-renders on every state change, not just the last one", async () => {
    // A store that notified only once would still end in the right final DOM,
    // so the intermediate state is what proves the subscription is live.
    const view = render();

    const upload = view.component.uploadFiles([makeFile("first.jpg")]);
    flushSync();
    expect(view.text(".status")).toBe("true");

    await upload;
    flushSync();
    expect(view.text(".status")).toBe("false");

    view.destroy();
  });

  it("renders keyed files across successive uploads", async () => {
    // `{#each … (file.id)}` is keyed, so a stale or duplicated id would leave
    // the previous upload's node in the DOM.
    const view = render();

    await view.component.uploadFiles([makeFile("first.jpg")]);
    flushSync();
    expect(view.all("li")[0].textContent).toContain("first.jpg");

    await view.component.uploadFiles([makeFile("second.jpg")]);
    flushSync();
    expect(view.all("li")).toHaveLength(1);
    expect(view.all("li")[0].textContent).toContain("second.jpg");

    view.destroy();
  });

  it("renders a server error into the template", async () => {
    const view = render(createFetcher({ fail: true }));

    await view.component.uploadFiles([makeFile()]);
    flushSync();

    expect(view.all("li")[0].textContent).toContain(":error");

    view.destroy();
  });

  it("clears the rendered state on reset", async () => {
    const view = render();

    await view.component.uploadFiles([makeFile()]);
    flushSync();
    expect(view.all("li")).toHaveLength(1);

    view.component.reset();
    flushSync();
    expect(view.all("li")).toHaveLength(0);
    expect(view.text(".count")).toBe("0");

    view.destroy();
  });

  it("tears down cleanly, and stops driving the DOM", async () => {
    // Scoped claim, deliberately. This proves destruction is clean — the
    // compiler's teardown runs against our store without throwing, and the
    // detached DOM stops changing.
    //
    // It does *not* prove the engine subscription was released: Svelte removes
    // its render effects on destroy, so a store with a no-op unsubscribe would
    // still leave the DOM frozen and pass here. That leak is caught by
    // "returns a working unsubscribe function" in `svelte-binding.test.ts`,
    // which observes the engine directly — verified by reverting the
    // unsubscribe and confirming that test, and only that test, fails.
    const view = render();

    await view.component.uploadFiles([makeFile("before.jpg")]);
    flushSync();
    const markupBefore = view.target.innerHTML;

    unmount(view.component);

    // The engine is still perfectly usable; the destroyed component must
    // simply no longer be driven by it.
    await view.component.uploadFiles([makeFile("after.jpg")]);
    flushSync();

    expect(view.target.innerHTML).not.toContain("after.jpg");
    expect(markupBefore).toContain("before.jpg");

    view.target.remove();
  });
});
