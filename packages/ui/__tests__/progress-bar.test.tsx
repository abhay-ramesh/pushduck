/**
 * @fileoverview ProgressBar.
 *
 * A progress bar is mostly one line of arithmetic and a width, so the tests are
 * about the arithmetic: what happens at the boundaries, and what happens with
 * the inputs an upload actually produces. A bar that renders `width: NaN%` or
 * `-40%` looks like a bar that renders nothing, and the component is fed by a
 * network-driven number that can legitimately arrive as 0, 100, or a fraction.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "../registry/default/progress-bar/progress-bar";

/** The inner bar is the only element whose width encodes the value. */
function widthOf(container: HTMLElement): string {
  const bars = container.querySelectorAll("div");
  const filled = [...bars].find((div) => div.style.width !== "");
  return filled?.style.width ?? "";
}

describe("ProgressBar", () => {
  it("renders the value as a percentage width", () => {
    const { container } = render(<ProgressBar value={42} />);
    expect(widthOf(container)).toBe("42%");
  });

  it("scales against a custom max", () => {
    // An upload reporting bytes rather than percent is the obvious use.
    const { container } = render(<ProgressBar value={50} max={200} />);
    expect(widthOf(container)).toBe("25%");
  });

  it("clamps above the maximum", () => {
    // A server that over-reports bytes would otherwise push the bar out of its
    // track, which in a flex layout drags the rest of the row with it.
    const { container } = render(<ProgressBar value={150} />);
    expect(widthOf(container)).toBe("100%");
  });

  it("clamps below zero", () => {
    const { container } = render(<ProgressBar value={-20} />);
    expect(widthOf(container)).toBe("0%");
  });

  it("renders zero as an empty bar, not a full one", () => {
    // The falsy-zero trap: `value || 100` would render a completed upload.
    const { container } = render(<ProgressBar value={0} />);
    expect(widthOf(container)).toBe("0%");
  });

  it("shows a rounded percentage when asked", () => {
    const { getByText } = render(<ProgressBar value={33.333} showValue />);
    expect(getByText("33%")).toBeTruthy();
  });

  it("hides the percentage by default", () => {
    const { queryByText } = render(<ProgressBar value={33} />);
    expect(queryByText("Progress")).toBeNull();
  });

  it("applies the variant class for a failed upload", () => {
    const { container } = render(<ProgressBar value={60} variant="error" />);
    expect(container.innerHTML).toContain("bg-destructive");
  });

  it("applies the size class", () => {
    const { container } = render(<ProgressBar value={60} size="lg" />);
    expect(container.innerHTML).toContain("h-3");
  });

  it("merges a custom className rather than dropping it", () => {
    // `cn` is tailwind-merge; a caller's class must survive it.
    const { container } = render(
      <ProgressBar value={10} className="my-custom-class" />
    );
    expect(container.innerHTML).toContain("my-custom-class");
  });
});
