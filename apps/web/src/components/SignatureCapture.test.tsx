import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SignatureCapture } from "@repo/ui/components/signature-capture";

const png = "data:image/png;base64,fixture";
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
});
afterEach(() => vi.restoreAllMocks());
const props = {
  label: "Signature",
  hint: "Space to draw, arrows to move",
  clearLabel: "Clear signature",
};

it("requires an actual stroke and emits null on clear", () => {
  const change = vi.fn();
  render(<SignatureCapture {...props} onChange={change} />);
  const canvas = screen.getByLabelText("Signature");
  fireEvent.keyDown(canvas, { key: " " });
  fireEvent.keyDown(canvas, { key: " " });
  expect(change).toHaveBeenLastCalledWith(null);
  fireEvent.keyDown(canvas, { key: " " });
  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  fireEvent.keyDown(canvas, { key: "ArrowDown" });
  fireEvent.keyDown(canvas, { key: " " });
  expect(change).toHaveBeenLastCalledWith(png);
  fireEvent.click(screen.getByRole("button", { name: "Clear signature" }));
  expect(change).toHaveBeenLastCalledWith(null);
});

it("does not collect a signature while disabled", () => {
  const change = vi.fn();
  render(<SignatureCapture {...props} onChange={change} disabled />);
  const canvas = screen.getByLabelText("Signature");
  fireEvent.keyDown(canvas, { key: " " });
  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  fireEvent.blur(canvas);
  expect(change).not.toHaveBeenCalled();
  expect(canvas).toHaveAttribute("aria-disabled", "true");
});
