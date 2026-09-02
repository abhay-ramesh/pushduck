/**
 * @fileoverview UploadDemo — the composed component.
 *
 * This is the one people copy first, so it is the one whose *end state* has to
 * be right. The individual components can each be correct while the composition
 * is not: the demo keeps its own file list, and the only thing tying it back to
 * the upload is how it reconciles the hook's results against that list. Get the
 * reconciliation wrong and every upload succeeds while the UI shows "Pending"
 * for ever — no error, nothing in the console, just a screen that never
 * finishes.
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadDemo } from "../registry/default/upload-demo/upload-demo";
import { installFetch, makeFile } from "./harness";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function zoneOf(container: HTMLElement): HTMLElement {
  const zone = container.querySelector(".border-dashed");
  if (!zone) throw new Error("no dropzone rendered");
  return zone as HTMLElement;
}

async function drop(zone: HTMLElement, files: File[]) {
  await act(async () => {
    fireEvent.drop(zone, { dataTransfer: { files, types: ["Files"] } });
  });
}

/** Reads a row from the summary table, e.g. "Uploaded". */
function summaryValue(container: HTMLElement, label: string): string {
  const row = [...container.querySelectorAll("div.flex.justify-between")].find(
    (div) => div.textContent?.startsWith(label)
  );
  return row?.querySelectorAll("span")[1]?.textContent ?? "";
}

describe("UploadDemo — composition", () => {
  it("renders the dropzone and the button together", () => {
    installFetch();
    const { getByText } = render(<UploadDemo route="imageUpload" />);

    expect(getByText("Upload files")).toBeTruthy();
    expect(getByText("Or choose files")).toBeTruthy();
  });

  it("hides the button when asked", () => {
    installFetch();
    const { queryByText } = render(
      <UploadDemo route="imageUpload" showButton={false} />
    );
    expect(queryByText("Or choose files")).toBeNull();
  });

  it("shows no file list until something is added", () => {
    installFetch();
    const { queryByText } = render(<UploadDemo route="imageUpload" />);
    expect(queryByText("Files")).toBeNull();
  });
});

describe("UploadDemo — file lifecycle", () => {
  it("lists a dropped file immediately", async () => {
    installFetch();
    const { container, getByText, getAllByText } = render(
      <UploadDemo route="imageUpload" />
    );

    await drop(zoneOf(container), [makeFile("photo.jpg", 2048)]);

    expect(getByText("Files")).toBeTruthy();
    expect(getByText("photo.jpg")).toBeTruthy();
    // Twice: once on the file's own row, once in the summary total.
    expect(getAllByText("2 KB")).toHaveLength(2);
  });

  it("marks the file uploaded once the upload finishes", async () => {
    // The regression this exists for: the demo reconciled results against its
    // own list by a field the upload result does not have, so nothing ever
    // left "Pending" — every upload succeeded and the UI never said so.
    installFetch();
    const { container, getByText } = render(<UploadDemo route="imageUpload" />);

    await drop(zoneOf(container), [makeFile("photo.jpg")]);

    await waitFor(() => expect(getByText("Uploaded")).toBeTruthy());
  });

  it("counts the upload in its summary", async () => {
    installFetch();
    const { container } = render(<UploadDemo route="imageUpload" />);

    await drop(zoneOf(container), [makeFile("photo.jpg", 1024)]);

    await waitFor(() =>
      expect(summaryValue(container, "Uploaded:")).toBe("1")
    );
    expect(summaryValue(container, "Total files:")).toBe("1");
    expect(summaryValue(container, "Failed:")).toBe("0");
    expect(summaryValue(container, "Total size:")).toBe("1 KB");
  });

  it("links to the uploaded file", async () => {
    // Proves the *result* was used, not merely that a status was flipped —
    // the url can only come from the server's response.
    installFetch();
    const { container, getByRole } = render(<UploadDemo route="imageUpload" />);

    await drop(zoneOf(container), [makeFile("photo.jpg")]);

    await waitFor(() => {
      const link = getByRole("link") as HTMLAnchorElement;
      expect(link.href).toContain("cdn.example.com");
    });
  });

  it("marks the file failed when the server rejects it", async () => {
    installFetch({ fail: true });
    const { container, getByText } = render(<UploadDemo route="imageUpload" />);

    await drop(zoneOf(container), [makeFile("photo.jpg")]);

    await waitFor(() =>
      expect(summaryValue(container, "Failed:")).toBe("1")
    );
    expect(getByText("Retry")).toBeTruthy();
  });

  it("sums the sizes of several files", async () => {
    installFetch();
    const { container } = render(<UploadDemo route="imageUpload" />);

    await drop(zoneOf(container), [
      makeFile("a.jpg", 1024),
      makeFile("b.jpg", 1024),
    ]);

    await waitFor(() =>
      expect(summaryValue(container, "Total files:")).toBe("2")
    );
    expect(summaryValue(container, "Total size:")).toBe("2 KB");
  });
});

describe("UploadDemo — controls", () => {
  it("removes only the file whose control was used", async () => {
    installFetch();
    const { container, getAllByTitle, queryByText, getByText } = render(
      <UploadDemo route="imageUpload" />
    );

    await drop(zoneOf(container), [makeFile("a.jpg"), makeFile("b.jpg")]);
    await waitFor(() => expect(getAllByTitle("Remove file")).toHaveLength(2));

    await act(async () => {
      fireEvent.click(getAllByTitle("Remove file")[0]);
    });

    expect(queryByText("a.jpg")).toBeNull();
    expect(getByText("b.jpg")).toBeTruthy();
  });

  it("returns a failed file to pending on retry", async () => {
    installFetch({ fail: true });
    const { container, getByText } = render(<UploadDemo route="imageUpload" />);

    await drop(zoneOf(container), [makeFile("photo.jpg")]);
    await waitFor(() => expect(getByText("Retry")).toBeTruthy());

    await act(async () => {
      fireEvent.click(getByText("Retry"));
    });

    expect(getByText("Pending")).toBeTruthy();
    expect(summaryValue(container, "Failed:")).toBe("0");
  });

  it("hides the list again once every file is removed", async () => {
    installFetch();
    const { container, getAllByTitle, queryByText } = render(
      <UploadDemo route="imageUpload" />
    );

    await drop(zoneOf(container), [makeFile("a.jpg")]);
    await waitFor(() => expect(getAllByTitle("Remove file")).toHaveLength(1));

    await act(async () => {
      fireEvent.click(getAllByTitle("Remove file")[0]);
    });

    expect(queryByText("Files")).toBeNull();
  });
});

describe("UploadDemo — callbacks", () => {
  it("forwards completion to the caller", async () => {
    installFetch();
    const onUploadComplete = vi.fn();
    const { container } = render(
      <UploadDemo route="imageUpload" onUploadComplete={onUploadComplete} />
    );

    await drop(zoneOf(container), [makeFile()]);

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalled());
  });

  it("forwards failure to the caller", async () => {
    installFetch({ fail: true });
    const onUploadError = vi.fn();
    const { container } = render(
      <UploadDemo route="imageUpload" onUploadError={onUploadError} />
    );

    await drop(zoneOf(container), [makeFile()]);

    await waitFor(() => expect(onUploadError).toHaveBeenCalled());
  });
});
