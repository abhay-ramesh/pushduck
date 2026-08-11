/**
 * @fileoverview FileList.
 *
 * This is the component a user actually reads during an upload, so the tests
 * are about what it *says*: the right status per file, a size a human can
 * parse, an error that names the failure, and controls that fire with the right
 * id. Getting the id wrong removes the wrong file — a silent, destructive bug
 * that looks fine on screen.
 */

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FileList,
  type FileItem,
} from "../registry/default/file-list/file-list";

function file(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    name: "photo.jpg",
    size: 1024,
    type: "image/jpeg",
    status: "pending",
    ...overrides,
  };
}

describe("FileList — empty state", () => {
  it("shows the default empty state with no files", () => {
    const { getByText } = render(<FileList files={[]} />);
    expect(getByText("No files selected")).toBeTruthy();
  });

  it("prefers custom empty content", () => {
    const { getByText, queryByText } = render(
      <FileList files={[]} emptyContent={<p>Nothing here yet</p>} />
    );
    expect(getByText("Nothing here yet")).toBeTruthy();
    expect(queryByText("No files selected")).toBeNull();
  });
});

describe("FileList — status", () => {
  it("labels a pending file", () => {
    const { getByText } = render(<FileList files={[file()]} />);
    expect(getByText("Pending")).toBeTruthy();
  });

  it("shows progress while uploading", () => {
    const { getByText } = render(
      <FileList files={[file({ status: "uploading", progress: 42 })]} />
    );
    expect(getByText("Uploading... 42%")).toBeTruthy();
  });

  it("shows 0% rather than blank at the start of an upload", () => {
    // `file.progress || 0` renders 0 correctly; the risk is the *bar*, which
    // is gated on `typeof progress === "number"` and would vanish on `||`.
    const { getByText, container } = render(
      <FileList files={[file({ status: "uploading", progress: 0 })]} />
    );
    expect(getByText("Uploading... 0%")).toBeTruthy();

    const bar = [...container.querySelectorAll("div")].find(
      (div) => div.style.width !== ""
    );
    expect(bar?.style.width).toBe("0%");
  });

  it("clamps a progress value outside 0-100", () => {
    const { container } = render(
      <FileList files={[file({ status: "uploading", progress: 140 })]} />
    );
    const bar = [...container.querySelectorAll("div")].find(
      (div) => div.style.width !== ""
    );
    expect(bar?.style.width).toBe("100%");
  });

  it("labels a completed file and links to it", () => {
    const { getByText, getByRole } = render(
      <FileList
        files={[
          file({ status: "success", url: "https://cdn.example.com/photo.jpg" }),
        ]}
      />
    );

    expect(getByText("Uploaded")).toBeTruthy();

    const link = getByRole("link") as HTMLAnchorElement;
    expect(link.href).toBe("https://cdn.example.com/photo.jpg");
    // Opening user content in a new tab without this leaks `window.opener`.
    expect(link.rel).toContain("noopener");
  });

  it("omits the link when a successful file has no url", () => {
    const { queryByRole } = render(
      <FileList files={[file({ status: "success" })]} />
    );
    expect(queryByRole("link")).toBeNull();
  });

  it("shows the specific error, not a generic one", () => {
    const { getAllByText } = render(
      <FileList files={[file({ status: "error", error: "File too large" })]} />
    );
    expect(getAllByText("File too large").length).toBeGreaterThan(0);
  });

  it("falls back to a generic message when the error has no text", () => {
    const { getByText } = render(
      <FileList files={[file({ status: "error" })]} />
    );
    expect(getByText("Upload failed")).toBeTruthy();
  });
});

describe("FileList — size formatting", () => {
  it.each([
    [0, "0 Bytes"],
    [512, "512 Bytes"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1048576, "1 MB"],
    [5242880, "5 MB"],
    [1073741824, "1 GB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    const { getByText } = render(<FileList files={[file({ size: bytes })]} />);
    expect(getByText(expected)).toBeTruthy();
  });
});

describe("FileList — controls", () => {
  it("removes the file whose button was clicked, not the first one", () => {
    // The destructive bug this guards: a handler closing over the wrong id
    // removes a different file, and the UI looks entirely correct.
    const onRemove = vi.fn();
    const { getAllByTitle } = render(
      <FileList
        files={[
          file({ id: "a", name: "a.jpg" }),
          file({ id: "b", name: "b.jpg" }),
          file({ id: "c", name: "c.jpg" }),
        ]}
        onRemove={onRemove}
      />
    );

    fireEvent.click(getAllByTitle("Remove file")[1]);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("b");
  });

  it("hides remove buttons when removal is disallowed", () => {
    const { queryAllByTitle } = render(
      <FileList files={[file()]} allowRemove={false} />
    );
    expect(queryAllByTitle("Remove file")).toHaveLength(0);
  });

  it("offers retry only on a failed file, and passes its id", () => {
    const onRetry = vi.fn();
    const { getByText } = render(
      <FileList
        files={[file({ id: "x", status: "error", error: "Network error" })]}
        onRetry={onRetry}
      />
    );

    fireEvent.click(getByText("Retry"));
    expect(onRetry).toHaveBeenCalledWith("x");
  });

  it("does not offer retry on a successful file", () => {
    const { queryByText } = render(
      <FileList files={[file({ status: "success" })]} onRetry={vi.fn()} />
    );
    expect(queryByText("Retry")).toBeNull();
  });

  it("does not offer retry when no handler is given", () => {
    const { queryByText } = render(
      <FileList files={[file({ status: "error", error: "Nope" })]} />
    );
    expect(queryByText("Retry")).toBeNull();
  });
});

describe("FileList — custom rendering", () => {
  it("uses renderFile for every item, with its index", () => {
    const { getByText } = render(
      <FileList
        files={[file({ id: "a", name: "a.jpg" }), file({ id: "b", name: "b.jpg" })]}
        renderFile={(item, index) => (
          <span>
            {index}:{item.name}
          </span>
        )}
      />
    );

    expect(getByText("0:a.jpg")).toBeTruthy();
    expect(getByText("1:b.jpg")).toBeTruthy();
  });

  it("renders one row per file, keyed by id", () => {
    const { getAllByTitle } = render(
      <FileList
        files={[
          file({ id: "a", name: "a.jpg" }),
          file({ id: "b", name: "b.jpg" }),
        ]}
      />
    );
    expect(getAllByTitle("Remove file")).toHaveLength(2);
  });
});
