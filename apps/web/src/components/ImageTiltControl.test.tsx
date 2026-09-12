import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageTiltControl } from "@repo/ui/components/image-tilt-control";

class TestPointerEvent extends MouseEvent {
  pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ImageTiltControl", () => {
  it("announces the current degrees and the allowed range", () => {
    const { slider } = renderDial({ initialValue: 3.2 });
    expect(slider).toHaveAttribute("aria-valuemin", "-15");
    expect(slider).toHaveAttribute("aria-valuemax", "15");
    expect(slider).toHaveAttribute("aria-valuenow", "3.2");
    expect(slider).toHaveAttribute("aria-valuetext", "+3.2°");
    expect(slider).toHaveAttribute("aria-orientation", "horizontal");
    expect(slider).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("+3.2°")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("adjusts by tenths, whole degrees, and range endpoints from the keyboard", () => {
    const { slider } = renderDial();
    const changes: [string, number][] = [
      ["ArrowRight", 0.1],
      ["ArrowUp", 0.2],
      ["ArrowLeft", 0.1],
      ["ArrowDown", 0],
      ["PageUp", 1],
      ["PageDown", 0],
      ["Home", -15],
      ["ArrowLeft", -15],
      ["End", 15],
      ["ArrowRight", 15],
    ];
    for (const [key, value] of changes) {
      fireEvent.keyDown(slider, { key });
      expect(slider).toHaveAttribute("aria-valuenow", String(value));
    }
  });

  it("lets the whole dial drag without a jump, moving the ruler with the finger", () => {
    const { slider, onChange, capture, release } = renderDial();
    const zeroTick = slider.querySelector(
      '[data-slot="tilt-ruler-tick"][data-value="0"]',
    )!;
    const pointer = slider.querySelector('[data-slot="tilt-ruler-pointer"]')!;
    const zeroStart = Number(zeroTick.getAttribute("x1"));
    const pointerStart = pointer.getAttribute("x1");

    fireEvent.pointerDown(slider, { pointerId: 4, clientX: 120, clientY: 42 });
    expect(onChange).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith(4);
    expect(slider).toHaveFocus();
    fireEvent.pointerMove(slider, { pointerId: 4, clientX: 150, clientY: 42 });
    expect(slider).toHaveAttribute("aria-valuenow", "-3");
    expect(Number(zeroTick.getAttribute("x1"))).toBeGreaterThan(zeroStart);
    expect(pointer).toHaveAttribute("x1", pointerStart);
    fireEvent.pointerMove(slider, { pointerId: 4, clientX: 119, clientY: 42 });
    expect(slider).toHaveAttribute("aria-valuenow", "0.1");
    fireEvent.pointerUp(slider, { pointerId: 4, clientX: 119, clientY: 42 });
    expect(release).toHaveBeenCalledWith(4);
    fireEvent.pointerMove(slider, { pointerId: 4, clientX: 200 });
    expect(slider).toHaveAttribute("aria-valuenow", "0.1");
  });

  it("supports whole-degree Shift+Arrow adjustments", () => {
    const { slider } = renderDial({ initialValue: 0.1 });
    fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
    expect(slider).toHaveAttribute("aria-valuenow", "1.1");
    fireEvent.keyDown(slider, { key: "ArrowDown", shiftKey: true });
    expect(slider).toHaveAttribute("aria-valuenow", "0.1");
  });

  it("clamps a drag outside the dial at both angle limits", () => {
    const { slider } = renderDial();
    fireEvent.pointerDown(slider, { pointerId: 2, clientX: 150 });
    fireEvent.pointerMove(slider, { pointerId: 2, clientX: 1_000 });
    expect(slider).toHaveAttribute("aria-valuenow", "-15");
    fireEvent.pointerMove(slider, { pointerId: 2, clientX: -1_000 });
    expect(slider).toHaveAttribute("aria-valuenow", "15");
  });

  it("ignores other fingers and stops adjusting after a pointer cancellation", () => {
    const { slider, onChange, release } = renderDial();
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150 });
    fireEvent.pointerDown(slider, { pointerId: 2, clientX: 50 });
    fireEvent.pointerMove(slider, { pointerId: 2, clientX: 200 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 140 });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(release).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 100 });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
  });

  it("stops adjusting when pointer capture is lost", () => {
    const { slider, onChange } = renderDial();
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150 });
    fireEvent.lostPointerCapture(slider, { pointerId: 1 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 100 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps ticks vertical and equally spaced as a linear ruler moves", () => {
    const { slider } = renderDial({ initialValue: -4.5 });
    for (const key of ["ArrowRight", "End", "Home"]) {
      fireEvent.keyDown(slider, { key });
      const ticks = [
        ...slider.querySelectorAll('[data-slot="tilt-ruler-tick"]'),
      ];
      expect(ticks.length).toBeGreaterThan(2);
      for (const tick of ticks) {
        expect(tick.getAttribute("x1")).toBe(tick.getAttribute("x2"));
        expect(Number(tick.getAttribute("y2"))).toBeGreaterThan(
          Number(tick.getAttribute("y1")),
        );
      }
      const spacing =
        Number(ticks[1]!.getAttribute("x1")) -
        Number(ticks[0]!.getAttribute("x1"));
      for (let index = 2; index < ticks.length; index += 1) {
        expect(
          Number(ticks[index]!.getAttribute("x1")) -
            Number(ticks[index - 1]!.getAttribute("x1")),
        ).toBeCloseTo(spacing);
      }
    }
  });

  it("supports the wider perspective range without changing drag sensitivity", () => {
    const { slider } = renderDial({ initialValue: 30, min: -45, max: 45 });
    expect(slider).toHaveAttribute("aria-valuemin", "-45");
    expect(slider).toHaveAttribute("aria-valuemax", "45");
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 120 });
    expect(slider).toHaveAttribute("aria-valuenow", "33");
    fireEvent.pointerUp(slider, { pointerId: 1 });
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveAttribute("aria-valuenow", "-45");
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "45");
  });

  it("disables dragging and keyboard changes", () => {
    const { slider, onChange, capture } = renderDial({
      initialValue: 2,
      disabled: true,
    });
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 100 });
    expect(onChange).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});

function renderDial({
  initialValue = 0,
  disabled = false,
  min,
  max,
}: {
  initialValue?: number;
  disabled?: boolean;
  min?: number;
  max?: number;
} = {}) {
  const onChange = vi.fn();
  function ControlledDial() {
    const [value, setValue] = useState(initialValue);
    return (
      <ImageTiltControl
        value={value}
        onValueChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        disabled={disabled}
        label="Straighten photo"
        min={min}
        max={max}
      />
    );
  }
  render(<ControlledDial />);
  const slider = screen.getByRole("slider", { name: "Straighten photo" });
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 300, 48),
  );
  const capture = vi.fn();
  const release = vi.fn();
  Object.assign(slider, {
    setPointerCapture: capture,
    hasPointerCapture: () => true,
    releasePointerCapture: release,
  });
  return { slider, onChange, capture, release };
}
