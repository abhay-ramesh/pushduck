/**
 * @fileoverview UploadButton, against the real upload hook.
 *
 * The hook is not mocked. A mocked `useUploadRoute` would only prove the
 * component calls the API this test imagines — which is exactly how the docs
 * came to advertise components that did not exist. Only `fetch` and
 * `XMLHttpRequest` are stubbed, because the alternative is a real bucket.
 *
 * The behaviour that matters is not the markup. It is: does clicking actually
 * start an upload, is the control locked while one is in flight, and can the
 * same file be selected twice in a row — the last being a real trap, since a
 * file input fires no `change` event when re-picking the same file unless its
 * value was cleared.
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadButton } from "../registry/default/upload-button/upload-button";
import { installFetch, makeFile, presignWasCalled } from "./harness";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The file input is hidden, so it is found by type rather than by role. */
function inputOf(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input rendered");
  return input as HTMLInputElement;
}

/** Selects files the way a picker would, then lets React settle. */
async function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    fireEvent.change(input);
  });
}

describe("UploadButton — rendering", () => {
  it("renders default label and an idle button", () => {
    installFetch();
    const { getByRole } = render(<UploadButton route="imageUpload" />);

    const button = getByRole("button") as HTMLButtonElement;
    expect(button.textContent).toContain("Upload Files");
    expect(button.disabled).toBe(false);
  });

  it("renders custom children over the default label", () => {
    installFetch();
    const { getByRole } = render(
      <UploadButton route="imageUpload">Pick a photo</UploadButton>
    );
    expect(getByRole("button").textContent).toContain("Pick a photo");
  });

  it("passes accept and multiple to the file input", () => {
    // These are the whole point of the props: a picker that ignores them shows
    // the user the wrong files.
    installFetch();
    const { container } = render(
      <UploadButton route="imageUpload" accept="image/png" multiple />
    );

    const input = inputOf(container);
    expect(input.accept).toBe("image/png");
    expect(input.multiple).toBe(true);
  });

  it("defaults to single-file selection", () => {
    installFetch();
    const { container } = render(<UploadButton route="imageUpload" />);
    expect(inputOf(container).multiple).toBe(false);
  });

  it("merges a custom className", () => {
    installFetch();
    const { getByRole } = render(
      <UploadButton route="imageUpload" className="my-class" />
    );
    expect(getByRole("button").className).toContain("my-class");
  });
});

describe("UploadButton — selecting files", () => {
  it("uploads the selected files", async () => {
    const fetchMock = installFetch();
    const { container } = render(<UploadButton route="imageUpload" />);

    await selectFiles(inputOf(container), [makeFile()]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("reports the selection before uploading it", async () => {
    installFetch();
    const onFilesSelected = vi.fn();
    const { container } = render(
      <UploadButton route="imageUpload" onFilesSelected={onFilesSelected} />
    );

    const file = makeFile("a.jpg");
    await selectFiles(inputOf(container), [file]);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it("clears the input so the same file can be picked twice", async () => {
    // A file input fires no `change` event when the same file is re-selected
    // unless its value was reset. Without this, retrying after a failure by
    // picking the same file silently does nothing.
    //
    // The assignment is observed rather than the resulting value: a file
    // input reads back as "" whether or not anything reset it, so asserting
    // `input.value === ""` passes even with the reset deleted.
    installFetch();
    const { container } = render(<UploadButton route="imageUpload" />);

    const input = inputOf(container);
    const writes: string[] = [];
    Object.defineProperty(input, "value", {
      get: () => "",
      set: (next: string) => writes.push(next),
      configurable: true,
    });

    await selectFiles(input, [makeFile()]);

    expect(writes).toContain("");
  });

  it("does nothing when the picker is dismissed", async () => {
    const fetchMock = installFetch();
    const onFilesSelected = vi.fn();
    const { container } = render(
      <UploadButton route="imageUpload" onFilesSelected={onFilesSelected} />
    );

    await selectFiles(inputOf(container), []);

    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(presignWasCalled(fetchMock)).toBe(false);
  });

  it("opens the picker when the button is clicked", () => {
    installFetch();
    const { container, getByRole } = render(
      <UploadButton route="imageUpload" />
    );

    const click = vi.spyOn(inputOf(container), "click");
    fireEvent.click(getByRole("button"));

    expect(click).toHaveBeenCalled();
  });
});

describe("UploadButton — disabled", () => {
  it("does not open the picker when disabled", () => {
    installFetch();
    const { container, getByRole } = render(
      <UploadButton route="imageUpload" disabled />
    );

    const click = vi.spyOn(inputOf(container), "click");
    fireEvent.click(getByRole("button"));

    expect(click).not.toHaveBeenCalled();
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables the underlying input too, not just the button", () => {
    // Otherwise the input remains reachable by keyboard and by tests, and a
    // "disabled" component still uploads.
    installFetch();
    const { container } = render(
      <UploadButton route="imageUpload" disabled />
    );
    expect(inputOf(container).disabled).toBe(true);
  });
});

describe("UploadButton — callbacks", () => {
  it("reports completion with the uploaded results", async () => {
    installFetch();
    const onUploadComplete = vi.fn();
    const { container } = render(
      <UploadButton route="imageUpload" onUploadComplete={onUploadComplete} />
    );

    await selectFiles(inputOf(container), [makeFile()]);

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalled());
    const [results] = onUploadComplete.mock.calls[0];
    expect(Array.isArray(results)).toBe(true);
    expect(results[0].status).toBe("success");
  });

  it("reports a server rejection through onUploadError", async () => {
    installFetch({ fail: true });
    const onUploadError = vi.fn();
    const { container } = render(
      <UploadButton route="imageUpload" onUploadError={onUploadError} />
    );

    await selectFiles(inputOf(container), [makeFile()]);

    await waitFor(() => expect(onUploadError).toHaveBeenCalled());
    const [error] = onUploadError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(String(error.message)).toMatch(/not allowed/i);
  });
});
