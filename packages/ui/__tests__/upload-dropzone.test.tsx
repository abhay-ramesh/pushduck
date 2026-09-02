/**
 * @fileoverview UploadDropzone.
 *
 * The largest component in the registry and the only one with real logic of its
 * own: client-side validation that runs *before* the server ever sees a file.
 * That makes it the one place a bug is genuinely expensive — a validator that
 * wrongly accepts wastes an upload and gets rejected server-side, and one that
 * wrongly rejects makes a legitimate file un-uploadable with no recourse.
 *
 * So the validation table below is exhaustive about the boundaries: exactly at
 * the size limit, exactly at the file count, wildcard MIME types, extension
 * matching, and the interaction between `multiple` and `maxFiles`.
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadDropzone } from "../registry/default/upload-dropzone/upload-dropzone";
import { installFetch, makeFile, presignWasCalled } from "./harness";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The drop target is the outer bordered div. */
function zoneOf(container: HTMLElement): HTMLElement {
  const zone = container.querySelector(".border-dashed");
  if (!zone) throw new Error("no dropzone rendered");
  return zone as HTMLElement;
}

/** Drops files onto the zone the way a browser would. */
async function drop(zone: HTMLElement, files: File[]) {
  await act(async () => {
    fireEvent.drop(zone, { dataTransfer: { files, types: ["Files"] } });
  });
}

describe("UploadDropzone — rendering", () => {
  it("renders its idle prompt", () => {
    installFetch();
    const { getByText } = render(<UploadDropzone route="imageUpload" />);
    expect(getByText("Upload files")).toBeTruthy();
  });

  it("states the limits it will enforce", () => {
    // A dropzone that silently rejects is worse than one that says the rule.
    installFetch();
    const { getByText } = render(
      <UploadDropzone route="imageUpload" maxSize={5 * 1024 * 1024} maxFiles={3} />
    );

    expect(getByText("Max size: 5 MB")).toBeTruthy();
    expect(getByText(/max 3/)).toBeTruthy();
  });

  it("lists accepted types when constrained", () => {
    installFetch();
    const { getByText } = render(
      <UploadDropzone route="imageUpload" accept="image/png" />
    );
    expect(getByText("Accepted: image/png")).toBeTruthy();
  });

  it("renders custom children instead of the default prompt", () => {
    installFetch();
    const { getByText, queryByText } = render(
      <UploadDropzone route="imageUpload">
        <p>Drop your receipts</p>
      </UploadDropzone>
    );

    expect(getByText("Drop your receipts")).toBeTruthy();
    expect(queryByText("Upload files")).toBeNull();
  });
});

describe("UploadDropzone — drag feedback", () => {
  it("responds to dragover and reverts on dragleave", () => {
    // Without visible feedback a user cannot tell the zone is live.
    installFetch();
    const { container, getByText, queryByText } = render(
      <UploadDropzone route="imageUpload" />
    );
    const zone = zoneOf(container);

    fireEvent.dragOver(zone);
    expect(getByText("Drop files here")).toBeTruthy();

    fireEvent.dragLeave(zone);
    expect(queryByText("Drop files here")).toBeNull();
    expect(getByText("Upload files")).toBeTruthy();
  });

  it("shows custom drag content when dragging", () => {
    installFetch();
    const { container, getByText } = render(
      <UploadDropzone route="imageUpload" dragContent={<p>Let go!</p>} />
    );

    fireEvent.dragOver(zoneOf(container));
    expect(getByText("Let go!")).toBeTruthy();
  });

  it("gives no drag feedback when disabled", () => {
    installFetch();
    const { container, queryByText } = render(
      <UploadDropzone route="imageUpload" disabled />
    );

    fireEvent.dragOver(zoneOf(container));
    expect(queryByText("Drop files here")).toBeNull();
  });
});

describe("UploadDropzone — accepting a drop", () => {
  it("uploads dropped files", async () => {
    const fetchMock = installFetch();
    const { container } = render(<UploadDropzone route="imageUpload" />);

    await drop(zoneOf(container), [makeFile()]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("reports the files before uploading them", async () => {
    installFetch();
    const onFilesAdded = vi.fn();
    const { container } = render(
      <UploadDropzone route="imageUpload" onFilesAdded={onFilesAdded} />
    );

    const file = makeFile("a.jpg");
    await drop(zoneOf(container), [file]);

    expect(onFilesAdded).toHaveBeenCalledWith([file]);
  });

  it("ignores a drop when disabled", async () => {
    const fetchMock = installFetch();
    const onFilesAdded = vi.fn();
    const { container } = render(
      <UploadDropzone route="imageUpload" disabled onFilesAdded={onFilesAdded} />
    );

    await drop(zoneOf(container), [makeFile()]);

    expect(onFilesAdded).not.toHaveBeenCalled();
    expect(presignWasCalled(fetchMock)).toBe(false);
  });
});

describe("UploadDropzone — validation", () => {
  it("rejects a file over the size limit, and says which", async () => {
    const fetchMock = installFetch();
    const { container, getByText } = render(
      <UploadDropzone route="imageUpload" maxSize={1000} />
    );

    await drop(zoneOf(container), [makeFile("huge.jpg", 5000)]);

    expect(getByText(/"huge.jpg" is too large/)).toBeTruthy();
    // The point of client-side validation: nothing was sent.
    expect(presignWasCalled(fetchMock)).toBe(false);
  });

  it("accepts a file exactly at the size limit", async () => {
    // The boundary is `>`, so equal must pass. An off-by-one here makes a
    // file that satisfies the documented limit un-uploadable.
    const fetchMock = installFetch();
    const { container } = render(
      <UploadDropzone route="imageUpload" maxSize={1000} />
    );

    await drop(zoneOf(container), [makeFile("exact.jpg", 1000)]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("rejects more files than maxFiles allows", async () => {
    const fetchMock = installFetch();
    const { container, getByText } = render(
      <UploadDropzone route="imageUpload" maxFiles={2} />
    );

    await drop(zoneOf(container), [
      makeFile("a.jpg"),
      makeFile("b.jpg"),
      makeFile("c.jpg"),
    ]);

    expect(getByText("Maximum 2 files allowed")).toBeTruthy();
    expect(presignWasCalled(fetchMock)).toBe(false);
  });

  it("accepts exactly maxFiles", async () => {
    const fetchMock = installFetch();
    const { container } = render(
      <UploadDropzone route="imageUpload" maxFiles={2} />
    );

    await drop(zoneOf(container), [makeFile("a.jpg"), makeFile("b.jpg")]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("rejects several files when multiple is off", async () => {
    const fetchMock = installFetch();
    const { container, getByText } = render(
      <UploadDropzone route="imageUpload" multiple={false} />
    );

    await drop(zoneOf(container), [makeFile("a.jpg"), makeFile("b.jpg")]);

    expect(getByText("Only one file is allowed")).toBeTruthy();
    expect(presignWasCalled(fetchMock)).toBe(false);
  });

  it("still accepts a single file when multiple is off", async () => {
    const fetchMock = installFetch();
    const { container } = render(
      <UploadDropzone route="imageUpload" multiple={false} />
    );

    await drop(zoneOf(container), [makeFile("a.jpg")]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("rejects a MIME type outside the accept list", async () => {
    const fetchMock = installFetch();
    const { container, getByText } = render(
      <UploadDropzone route="imageUpload" accept="image/png" />
    );

    await drop(zoneOf(container), [
      makeFile("doc.pdf", 100, "application/pdf"),
    ]);

    expect(getByText(/"doc.pdf" is not an accepted file type/)).toBeTruthy();
    expect(presignWasCalled(fetchMock)).toBe(false);
  });

  it("honours a wildcard MIME type", async () => {
    // `image/*` is the most common accept value there is; it is matched by
    // turning the `*` into a regex, which is easy to get wrong.
    const fetchMock = installFetch();
    const { container } = render(
      <UploadDropzone route="imageUpload" accept="image/*" />
    );

    await drop(zoneOf(container), [makeFile("a.png", 100, "image/png")]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("matches by extension when accept lists one", async () => {
    // Extensions are matched against the *name*, since a file dragged from
    // some sources arrives with an empty `type`.
    const fetchMock = installFetch();
    const { container } = render(
      <UploadDropzone route="imageUpload" accept=".pdf" />
    );

    await drop(zoneOf(container), [makeFile("report.pdf", 100, "")]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("matches an extension case-insensitively", async () => {
    const fetchMock = installFetch();
    const { container } = render(
      <UploadDropzone route="imageUpload" accept=".pdf" />
    );

    await drop(zoneOf(container), [makeFile("REPORT.PDF", 100, "")]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("accepts a file matching any entry in a list", async () => {
    const fetchMock = installFetch();
    const { container } = render(
      <UploadDropzone route="imageUpload" accept="image/png, application/pdf" />
    );

    await drop(zoneOf(container), [
      makeFile("doc.pdf", 100, "application/pdf"),
    ]);

    await waitFor(() => expect(presignWasCalled(fetchMock)).toBe(true));
  });

  it("applies a custom validator", async () => {
    const fetchMock = installFetch();
    const { container, getByText } = render(
      <UploadDropzone
        route="imageUpload"
        validator={(files) =>
          files.some((file) => file.name.includes(" "))
            ? "Filenames cannot contain spaces"
            : null
        }
      />
    );

    await drop(zoneOf(container), [makeFile("my photo.jpg")]);

    expect(getByText("Filenames cannot contain spaces")).toBeTruthy();
    expect(presignWasCalled(fetchMock)).toBe(false);
  });

  it("reports every failing file, not just the first", async () => {
    installFetch();
    const { container, getByText } = render(
      <UploadDropzone route="imageUpload" maxSize={1000} />
    );

    await drop(zoneOf(container), [
      makeFile("big1.jpg", 5000),
      makeFile("big2.jpg", 5000),
    ]);

    expect(getByText(/"big1.jpg" is too large/)).toBeTruthy();
    expect(getByText(/"big2.jpg" is too large/)).toBeTruthy();
  });

  it("clears earlier errors once a valid drop succeeds", async () => {
    // Stale errors describing a file the user already replaced are worse than
    // no errors at all.
    installFetch();
    const { container, getByText, queryByText } = render(
      <UploadDropzone route="imageUpload" maxSize={2000} />
    );
    const zone = zoneOf(container);

    await drop(zone, [makeFile("big.jpg", 5000)]);
    expect(getByText(/too large/)).toBeTruthy();

    await drop(zone, [makeFile("small.jpg", 100)]);
    await waitFor(() => expect(queryByText(/too large/)).toBeNull());
  });
});

describe("UploadDropzone — errors from the server", () => {
  it("surfaces a rejection and reports it", async () => {
    installFetch({ fail: true });
    const onUploadError = vi.fn();
    const { container } = render(
      <UploadDropzone route="imageUpload" onUploadError={onUploadError} />
    );

    await drop(zoneOf(container), [makeFile()]);

    await waitFor(() => expect(onUploadError).toHaveBeenCalled());
    const [error] = onUploadError.mock.calls[0];
    expect(String(error.message)).toMatch(/not allowed/i);
  });
});
