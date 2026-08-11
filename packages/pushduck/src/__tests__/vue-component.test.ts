// @vitest-environment happy-dom

/**
 * @fileoverview Vue binding inside a real mounted component.
 *
 * `vue-binding.test.ts` drives the composable directly against Vue's real
 * reactivity runtime — `effectScope`, `computed`, `nextTick`. That covers the
 * reactive contract, but not the component *lifecycle*: whether the engine
 * subscription is actually released when a real component unmounts.
 *
 * `onScopeDispose` firing under a manually-created `effectScope` does not prove
 * it fires under a component's own scope — those are different owners, and a
 * leak here would keep an engine (and its abort controllers) alive for every
 * component a user ever mounted.
 */

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { UploadClientConfig } from "../core/upload";
import { useUploadRoute } from "../vue";

function makeFile(name = "photo.jpg", size = 1000, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function createFetcher(): NonNullable<UploadClientConfig["fetcher"]> {
  return vi.fn(async (input: RequestInfo) => {
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

/** A component using the composable exactly as a user's SFC would. */
function defineUploader(fetcher: NonNullable<UploadClientConfig["fetcher"]>) {
  return defineComponent({
    setup() {
      // Destructured to top-level bindings, mirroring `<script setup>` — which
      // is how the docs show it, and the only form where Vue auto-unwraps the
      // refs in a template. Returning a nested `{ upload }` would leave
      // `upload.files` a Ref and break `v-for`, so the composable returning
      // individually-destructurable refs is load-bearing, not cosmetic.
      const { files, progress, isUploading, uploadFiles } = useUploadRoute(
        "imageUpload",
        { endpoint: "/api/upload", fetcher, transport: noopTransport }
      );
      return { files, progress, isUploading, uploadFiles };
    },
    render() {
      // Renders the reactive fields, so a broken ref surfaces as wrong markup
      // rather than only as a failed assertion on the composable's return.
      return h("div", [
        h("progress", { value: this.progress, max: 100 }),
        h("span", { class: "status" }, String(this.isUploading)),
        h(
          "ul",
          this.files.map((file) =>
            h("li", { key: file.id }, `${file.name}:${file.status}`)
          )
        ),
      ]);
    },
  });
}

describe("Vue binding in a mounted component", () => {
  it("renders reactive state through the template", async () => {
    const wrapper = mount(defineUploader(createFetcher()));

    expect(wrapper.find(".status").text()).toBe("false");
    expect(wrapper.findAll("li")).toHaveLength(0);

    await wrapper.vm.uploadFiles([makeFile()]);
    await flushPromises();

    // The DOM, not just the composable's return value.
    expect(wrapper.findAll("li")).toHaveLength(1);
    expect(wrapper.find("li").text()).toBe("photo.jpg:success");
    expect(wrapper.find("progress").attributes("value")).toBe("100");
    expect(wrapper.find(".status").text()).toBe("false");
  });

  it("releases the engine subscription when the component unmounts", async () => {
    // The leak this guards against: an engine kept alive by a subscription for
    // every component instance a user ever mounted.
    const wrapper = mount(defineUploader(createFetcher()));

    const before = wrapper.vm.files.length;
    wrapper.unmount();

    // The engine still runs, but a disposed component must no longer sync.
    await wrapper.vm.uploadFiles([makeFile()]);
    await flushPromises();

    expect(wrapper.vm.files.length).toBe(before);
  });

  it("keeps rendering while mounted, across several uploads", async () => {
    const wrapper = mount(defineUploader(createFetcher()));

    await wrapper.vm.uploadFiles([makeFile("first.jpg")]);
    await flushPromises();
    expect(wrapper.find("li").text()).toContain("first.jpg");

    await wrapper.vm.uploadFiles([makeFile("second.jpg")]);
    await flushPromises();
    expect(wrapper.find("li").text()).toContain("second.jpg");

    wrapper.unmount();
  });
});
