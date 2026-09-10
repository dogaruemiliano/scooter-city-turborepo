import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CropCorner, CropRect } from "../_lib/receipt-image";
import { ReceiptCropper } from "./ReceiptCropper";

const INITIAL_CROP: CropRect = {
  x: 0.1,
  y: 0.2,
  width: 0.6,
  height: 0.5,
};

const originalPointerEvent = Object.getOwnPropertyDescriptor(
  window,
  "PointerEvent",
);

class TestPointerEvent extends MouseEvent {
  pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeEach(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreProperty(window, "PointerEvent", originalPointerEvent);
});

describe("ReceiptCropper", () => {
  it("shows a magnified preview away from the active corner and updates its exact sample", () => {
    const { onCropChange } = renderCropper();
    const handle = screen.getByRole("button", { name: "north-west" });

    expect(cropLoupe()).toBeNull();

    fireEvent.pointerDown(handle, {
      pointerId: 7,
      clientX: 20,
      clientY: 80,
      buttons: 1,
    });

    const initialLoupe = cropLoupe();
    expect(initialLoupe).toHaveAttribute("aria-hidden", "true");
    expect(initialLoupe).toHaveClass(
      "pointer-events-none",
      "z-raised",
      "size-24",
      "rounded-full",
    );
    expect(initialLoupe?.style.backgroundImage).toContain("blob:receipt");
    expect(initialLoupe?.style.backgroundSize).toBe("400px 800px");
    expect(initialLoupe?.style.backgroundPosition).toBe("8px -112px");
    expect(initialLoupe?.style.left).toContain("+ var(--spacing-18)");
    expect(initialLoupe?.style.top).toContain("+ var(--spacing-18)");
    expect(
      initialLoupe?.querySelector('[data-slot="crop-loupe-crosshair-outline"]'),
    ).toHaveClass("h-1", "w-8", "bg-mist-950");

    fireEvent.pointerMove(handle, {
      pointerId: 7,
      clientX: 40,
      clientY: 120,
      buttons: 1,
    });

    const nextCrop = onCropChange.mock.lastCall?.[0];
    expect(nextCrop?.x).toBeCloseTo(0.2);
    expect(nextCrop?.y).toBeCloseTo(0.3);
    expect(nextCrop?.width).toBeCloseTo(0.5);
    expect(nextCrop?.height).toBeCloseTo(0.4);
    expect(cropLoupe()?.style.backgroundPosition).toBe("-32px -192px");

    fireEvent.pointerUp(handle, { pointerId: 7 });
    expect(cropLoupe()).toBeNull();
  });

  it.each([
    ["north-west", "8px -112px"],
    ["north-east", "-232px -112px"],
    ["south-west", "8px -512px"],
    ["south-east", "-232px -512px"],
  ] satisfies ReadonlyArray<[CropCorner, string]>)(
    "samples the exact %s crop point at the loupe crosshair",
    (corner, expectedPosition) => {
      renderCropper();
      const handle = screen.getByRole("button", { name: corner });

      fireEvent.pointerDown(handle, {
        pointerId: 3,
        clientX: 20,
        clientY: 80,
        buttons: 1,
      });

      expect(cropLoupe()?.style.backgroundPosition).toBe(expectedPosition);
    },
  );

  it("hides the preview after cancellation or lost pointer capture", () => {
    renderCropper();
    const handle = screen.getByRole("button", { name: "south-east" });

    fireEvent.pointerDown(handle, { pointerId: 4, clientX: 140, clientY: 280 });
    expect(cropLoupe()).not.toBeNull();
    fireEvent.pointerCancel(handle, { pointerId: 4 });
    expect(cropLoupe()).toBeNull();

    fireEvent.pointerDown(handle, { pointerId: 5, clientX: 140, clientY: 280 });
    expect(cropLoupe()).not.toBeNull();
    fireEvent.lostPointerCapture(handle, { pointerId: 5 });
    expect(cropLoupe()).toBeNull();
  });

  it("ignores movement and release from a different pointer", () => {
    const { onCropChange } = renderCropper();
    const handle = screen.getByRole("button", { name: "north-east" });

    fireEvent.pointerDown(handle, { pointerId: 9, clientX: 140, clientY: 80 });
    fireEvent.pointerMove(handle, {
      pointerId: 10,
      clientX: 120,
      clientY: 100,
    });
    fireEvent.pointerUp(handle, { pointerId: 10 });

    expect(onCropChange).not.toHaveBeenCalled();
    expect(cropLoupe()).not.toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 9 });
    expect(cropLoupe()).toBeNull();
  });

  it("does not show or update the helper for a zero-size image frame", () => {
    const { frame, onCropChange } = renderCropper(false);
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(rect(0, 0));
    const handle = screen.getByRole("button", { name: "north-west" });

    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 20, clientY: 80 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 40, clientY: 120 });

    expect(cropLoupe()).toBeNull();
    expect(onCropChange).not.toHaveBeenCalled();
  });
});

function renderCropper(mockFrame = true) {
  const onCropChange = vi.fn<(crop: CropRect) => void>();

  function ControlledCropper() {
    const [crop, setCrop] = useState(INITIAL_CROP);
    return (
      <ReceiptCropper
        sourceUrl="blob:receipt"
        crop={crop}
        onCropChange={(nextCrop) => {
          onCropChange(nextCrop);
          setCrop(nextCrop);
        }}
        imageAlt="Receipt"
        cornerLabel={(corner) => corner}
      />
    );
  }

  render(<ControlledCropper />);
  const frame = document.querySelector<HTMLElement>(
    '[data-slot="receipt-crop-frame"]',
  );
  if (!frame) throw new Error("Crop frame was not rendered");
  if (mockFrame) {
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(rect(200, 400));
  }

  return { frame, onCropChange };
}

function cropLoupe() {
  return document.querySelector<HTMLElement>(
    '[data-slot="crop-corner-preview"]',
  );
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    width,
    height,
    toJSON: () => ({}),
  };
}

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
}
