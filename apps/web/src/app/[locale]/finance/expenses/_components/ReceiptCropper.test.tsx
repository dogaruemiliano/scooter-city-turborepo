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
  it.each([
    { edge: "north", expected: { x: 0.1, y: 0.3, width: 0.6, height: 0.4 } },
    { edge: "south", expected: { x: 0.1, y: 0.2, width: 0.6, height: 0.6 } },
    { edge: "west", expected: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } },
    { edge: "east", expected: { x: 0.1, y: 0.2, width: 0.7, height: 0.5 } },
  ])(
    "drags the $edge edge independently of the other boundaries",
    ({ edge, expected }) => {
      const { frame, onCropChange } = renderMeasuredCropper();
      const handle = screen.getByRole("button", {
        name: `Resize ${edge} edge`,
      });
      const width = Number.parseFloat(frame.style.width);
      const height = Number.parseFloat(frame.style.height);
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(handle, {
        pointerId: 1,
        clientX: 100 + width / 10,
        clientY: 100 + height / 10,
      });
      const next = onCropChange.mock.lastCall![0];
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(next[key]).toBeCloseTo(expected[key]);
      }
      expect(Number.parseFloat(frame.style.width)).toBe(width);
      fireEvent.pointerUp(handle, { pointerId: 1 });
      expect(cropLoupe()).toBeNull();
    },
  );

  it("resizes an edge with the keyboard and enforces the minimum crop size", () => {
    const { onCropChange } = renderMeasuredCropper();
    const handle = screen.getByRole("button", { name: "Resize west edge" });
    for (let index = 0; index < 100; index++)
      fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyUp(handle, { key: "ArrowRight" });
    const crop = onCropChange.mock.lastCall![0];
    expect(crop.width).toBeCloseTo(0.15);
    expect(crop.x + crop.width).toBeCloseTo(
      INITIAL_CROP.x + INITIAL_CROP.width,
    );
    expect(crop.y).toBe(INITIAL_CROP.y);
    expect(crop.height).toBeCloseTo(INITIAL_CROP.height);
  });

  it("previews both perspective axes with every original corner inside the expanded canvas", () => {
    const { frame, setPerspective } = renderCropper();
    const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
    loadSourceDimensions(1000, 600);
    const image = screen.getByRole<HTMLImageElement>("img", {
      name: "Receipt",
    });
    setPerspective(12, -8);
    const matrix = readMatrix(image);
    expect(matrix[3]).not.toBe(0);
    expect(matrix[7]).not.toBe(0);
    expectAllCornersVisible(image, frame, 1000, 600);
    expect(image).toHaveAttribute("src", "blob:receipt");
    expect(
      frame.querySelector('[data-slot="crop-alignment-grid"]'),
    ).toBeInTheDocument();
    setPerspective(0, 0);
    expect(frame).toHaveStyle({ width: "1000px", height: "600px" });
    expect(readMatrix(image)).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    expect(encode).not.toHaveBeenCalled();
  });

  it("samples the same perspective-corrected source in the loupe while preserving crop coordinates", () => {
    const { frame, setPerspective, onCropChange } = renderMeasuredCropper();
    setPerspective(9, -11);
    const image = screen.getByRole<HTMLImageElement>("img", {
      name: "Receipt",
    });
    const frameWidth = Number.parseFloat(frame.style.width);
    const frameHeight = Number.parseFloat(frame.style.height);
    const handle = screen.getByRole("button", { name: "north-west" });
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 100, clientY: 100 });
    const loupe = cropLoupe()!;
    const magnified = loupe.querySelector<HTMLImageElement>(
      '[data-slot="crop-transformed-image"]',
    )!;
    const sample = loupe.querySelector<HTMLElement>(
      '[data-slot="crop-loupe-transformed-surface"]',
    )!;
    expect(magnified.style.transform).toBe(image.style.transform);
    expect(magnified.src).toBe(image.src);
    expect(Number.parseFloat(sample.style.width)).toBeCloseTo(frameWidth * 2);
    expect(Number.parseFloat(sample.style.height)).toBeCloseTo(frameHeight * 2);
    expect(Number.parseFloat(sample.style.left)).toBeCloseTo(
      48 - INITIAL_CROP.x * frameWidth * 2,
    );
    expect(Number.parseFloat(sample.style.top)).toBeCloseTo(
      48 - INITIAL_CROP.y * frameHeight * 2,
    );
    fireEvent.pointerMove(handle, {
      pointerId: 2,
      clientX: 100 + frameWidth / 10,
      clientY: 100,
    });
    expect(onCropChange.mock.lastCall?.[0].x).toBeCloseTo(0.2);
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(image).toHaveAttribute("src", "blob:receipt");
  });

  it("keeps outside image regions under a theme-aware translucent mask and controls opaque", () => {
    const { frame } = renderMeasuredCropper();
    const mask = frame.querySelector('[data-slot="crop-outside-mask"]')!;
    expect(mask.children).toHaveLength(4);
    for (const region of mask.children)
      expect(region).toHaveClass("bg-background/60");
    const handle = screen.getByRole("button", { name: "north-west" });
    expect(handle.querySelector("span")).toHaveClass(
      "bg-background",
      "border-foreground",
    );
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 65.6,
      clientY: 148.8,
    });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(
      screen.getByRole("button", { name: "Show entire photo" }),
    ).toHaveClass("bg-background", "text-foreground");
    expect(screen.getByRole("img", { name: "Receipt" })).toHaveAttribute(
      "src",
      "blob:receipt",
    );
  });

  it("freezes the view during a drag, then centers and enlarges the selected region", () => {
    const { frame, onCropChange } = renderMeasuredCropper();
    const handle = screen.getByRole("button", { name: "north-west" });
    expect(frame).toHaveStyle({
      left: "32px",
      top: "48px",
      width: "336px",
      height: "504px",
    });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 65.6,
      clientY: 148.8,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 99.2,
      clientY: 199.2,
    });
    expect(frame).toHaveStyle({
      left: "32px",
      top: "48px",
      width: "336px",
      height: "504px",
    });
    expect(onCropChange.mock.lastCall?.[0].x).toBeCloseTo(0.2);
    expect(onCropChange.mock.lastCall?.[0].y).toBeCloseTo(0.3);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(672);
    expect(Number.parseFloat(frame.style.height)).toBeCloseTo(1008);
    expect(Number.parseFloat(frame.style.left)).toBeCloseTo(-102.4);
    expect(Number.parseFloat(frame.style.top)).toBeCloseTo(-204);
    expect(onCropChange).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Show entire photo" }),
    ).toBeEnabled();
  });

  it("allows subsequent editing in the enlarged preview without moving the corner on pointer down", () => {
    const { frame, onCropChange } = renderMeasuredCropper();
    const handle = screen.getByRole("button", { name: "north-west" });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 65.6,
      clientY: 148.8,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 99.2,
      clientY: 199.2,
    });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    const committedFrame = frame.style.cssText;
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 32, clientY: 98.4 });
    expect(frame.style.cssText).toBe(committedFrame);
    fireEvent.pointerMove(handle, {
      pointerId: 2,
      clientX: 99.2,
      clientY: 98.4,
    });
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(672);
    expect(onCropChange.mock.lastCall?.[0].x).toBeCloseTo(0.3);
    expect(onCropChange.mock.lastCall?.[0].width).toBeCloseTo(0.4);
    const loupe = cropLoupe()!;
    const frameLeft = Number.parseFloat(frame.style.left);
    expect(
      frameLeft + Number.parseFloat(loupe.style.left),
    ).toBeGreaterThanOrEqual(48);
    expect(frameLeft + Number.parseFloat(loupe.style.left)).toBeLessThanOrEqual(
      352,
    );
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(840);
  });

  it("zooms out without resetting the crop so its boundaries can be expanded", () => {
    const { frame, onCropChange } = renderMeasuredCropper();
    const handle = screen.getByRole("button", { name: "north-west" });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 65.6,
      clientY: 148.8,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 99.2,
      clientY: 199.2,
    });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Show entire photo" }));
    expect(frame).toHaveStyle({
      left: "32px",
      top: "48px",
      width: "336px",
      height: "504px",
    });
    expect(onCropChange).toHaveBeenCalledOnce();
    fireEvent.pointerDown(handle, {
      pointerId: 2,
      clientX: 99.2,
      clientY: 199.2,
    });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 32, clientY: 98.4 });
    expect(onCropChange.mock.lastCall?.[0].x).toBeCloseTo(0);
    expect(onCropChange.mock.lastCall?.[0].y).toBeCloseTo(0.1);
    expect(onCropChange.mock.lastCall?.[0].width).toBeCloseTo(0.7);
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(480);
  });

  it("keeps zoom out away from both crop handles in a short, narrow preview", () => {
    const { frame } = renderMeasuredCropper(400, 72);
    const handle = screen.getByRole("button", { name: "north-west" });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 187.2,
      clientY: 21.6,
    });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    const zoomOut = screen.getByRole("button", { name: "Show entire photo" });
    const selectedLeft =
      Number.parseFloat(frame.style.left) +
      INITIAL_CROP.x * Number.parseFloat(frame.style.width);
    expect(Number.parseFloat(zoomOut.style.left) + 48).toBeLessThanOrEqual(
      selectedLeft - 24,
    );
    expect(Number.parseFloat(zoomOut.style.top)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(zoomOut.style.top) + 48).toBeLessThanOrEqual(72);
    fireEvent.click(zoomOut);
    expect(Number.parseFloat(frame.style.height)).toBeCloseTo(48);
  });

  it("waits for keyboard completion before fitting the changed selection", () => {
    const { frame, onCropChange } = renderMeasuredCropper();
    const handle = screen.getByRole("button", { name: "north-west" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight", repeat: true });
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(336);
    fireEvent.keyUp(handle, { key: "ArrowRight" });
    expect(Number.parseFloat(frame.style.width)).toBeGreaterThan(336);
    expect(onCropChange.mock.lastCall?.[0].x).toBeCloseTo(0.12);
    expect(onCropChange).toHaveBeenCalledTimes(2);
  });

  it("uses tilted bounds for the focused view and restores a full view on explicit reset or a new source", () => {
    const { frame, setTilt, setViewResetKey, setSourceUrl, onCropChange } =
      renderMeasuredCropper();
    const handle = screen.getByRole("button", { name: "north-west" });
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      clientX: 65.6,
      clientY: 148.8,
    });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(Number.parseFloat(frame.style.width)).toBeGreaterThan(336);
    setTilt(15);
    expect(
      Number.parseFloat(frame.style.width) /
        Number.parseFloat(frame.style.height),
    ).toBeCloseTo(1084 / 1367);
    expect(onCropChange).not.toHaveBeenCalled();
    setTilt(0);
    setViewResetKey(1);
    expect(frame).toHaveStyle({ width: "336px", height: "504px" });
    expect(
      screen.queryByRole("button", { name: "Show entire photo" }),
    ).not.toBeInTheDocument();
    fireEvent.pointerDown(handle, {
      pointerId: 2,
      clientX: 65.6,
      clientY: 148.8,
    });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    setSourceUrl("blob:new-receipt");
    loadSourceDimensions(800, 1200);
    expect(frame).toHaveStyle({ width: "336px", height: "504px" });
    expect(screen.getByRole("img", { name: "Receipt" })).toHaveAttribute(
      "src",
      "blob:new-receipt",
    );
  });

  it("previews fine tilt within expanded bounds without changing or encoding the source", () => {
    const { frame, setTilt } = renderCropper(true, 30);
    const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
    loadSourceDimensions(800, 600);

    const source = screen.getByRole<HTMLImageElement>("img", {
      name: "Receipt",
    });
    expect(frame).toHaveStyle({ width: "993px", height: "920px" });
    expect(source).toHaveAttribute("src", "blob:receipt");
    expect(frame).toHaveClass("bg-background");
    expect(
      frame.querySelector('[data-slot="crop-alignment-grid"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expectAllCornersVisible(source, frame, 800, 600);

    setTilt(-20);
    expectAllCornersVisible(source, frame, 800, 600);
    expect(source).toHaveAttribute("src", "blob:receipt");
    setTilt(0);
    expect(frame).toHaveStyle({ width: "800px", height: "600px" });
    expect(frame.querySelector('[data-slot="crop-alignment-grid"]')).toBeNull();
    expect(readMatrix(source)).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    expect(encode).not.toHaveBeenCalled();
  });

  it("uniformly fits both expanded dimensions when available height or width changes", () => {
    const { frame } = renderCropper(false, 30);
    const available = document.querySelector<HTMLElement>(
      '[data-slot="crop-available-space"]',
    )!;
    let space = rect(400, 250);
    vi.spyOn(available, "getBoundingClientRect").mockImplementation(
      () => space,
    );
    fireEvent(window, new Event("resize"));
    loadSourceDimensions(800, 600);

    expect(Number.parseFloat(frame.style.height)).toBeCloseTo(186);
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo((993 * 186) / 920);
    space = rect(180, 450);
    fireEvent(window, new Event("resize"));
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo(120);
    expect(Number.parseFloat(frame.style.height)).toBeCloseTo(
      (920 * 120) / 993,
    );
    expect(screen.getByRole("img", { name: "Receipt" })).toHaveAttribute(
      "src",
      "blob:receipt",
    );
  });

  it("uses the same tilted source and crop point in the magnifying loupe", () => {
    const { frame, onCropChange } = renderCropper(true, 15);
    loadSourceDimensions(800, 1600);
    const image = screen.getByRole<HTMLImageElement>("img", {
      name: "Receipt",
    });
    const handle = screen.getByRole("button", { name: "north-west" });
    fireEvent.pointerDown(handle, {
      pointerId: 8,
      clientX: 20,
      clientY: 80,
      buttons: 1,
    });

    const loupe = cropLoupe()!;
    const loupeImage = loupe.querySelector<HTMLImageElement>(
      '[data-slot="crop-transformed-image"]',
    )!;
    const sample = loupe.querySelector<HTMLElement>(
      '[data-slot="crop-loupe-transformed-surface"]',
    )!;
    expect(loupeImage.src).toBe(image.src);
    expect(loupeImage.style.transform).toBe(image.style.transform);
    expect(loupe).toHaveClass("bg-background");
    expect(sample).toHaveStyle({
      width: "400px",
      height: "800px",
      left: "8px",
      top: "-112px",
    });
    fireEvent.pointerMove(handle, {
      pointerId: 8,
      clientX: 40,
      clientY: 120,
      buttons: 1,
    });
    const nextCrop = onCropChange.mock.lastCall?.[0];
    expect(nextCrop?.x).toBeCloseTo(0.2);
    expect(nextCrop?.y).toBeCloseTo(0.3);
    expect(nextCrop?.width).toBeCloseTo(0.5);
    expect(nextCrop?.height).toBeCloseTo(0.4);
    expect(Number.parseFloat(sample.style.left)).toBeCloseTo(-32);
    expect(Number.parseFloat(sample.style.top)).toBeCloseTo(-192);
    expect(
      frame.querySelectorAll('[data-slot="crop-transformed-image"]'),
    ).toHaveLength(2);
    fireEvent.pointerUp(handle, { pointerId: 8 });
    expect(cropLoupe()).toBeNull();
  });

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
    ).toHaveClass("h-1", "w-8", "bg-background");

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

function renderMeasuredCropper(width = 400, height = 600) {
  const result = renderCropper(false);
  const available = document.querySelector<HTMLElement>(
    '[data-slot="crop-available-space"]',
  )!;
  vi.spyOn(available, "getBoundingClientRect").mockReturnValue(
    rect(width, height),
  );
  fireEvent(window, new Event("resize"));
  loadSourceDimensions(800, 1200);
  vi.spyOn(result.frame, "getBoundingClientRect").mockImplementation(() =>
    rect(
      Number.parseFloat(result.frame.style.width),
      Number.parseFloat(result.frame.style.height),
      Number.parseFloat(result.frame.style.left),
      Number.parseFloat(result.frame.style.top),
    ),
  );
  return result;
}

function renderCropper(mockFrame = true, initialTilt = 0) {
  const onCropChange = vi.fn<(crop: CropRect) => void>();

  let tilt = initialTilt;
  let viewResetKey = 0;
  let sourceUrl = "blob:receipt";
  let rotationX = 0;
  let rotationY = 0;
  function ControlledCropper({
    tilt,
    viewResetKey,
    sourceUrl,
    rotationX,
    rotationY,
  }: {
    tilt: number;
    viewResetKey: number;
    sourceUrl: string;
    rotationX: number;
    rotationY: number;
  }) {
    const [crop, setCrop] = useState(INITIAL_CROP);
    return (
      <ReceiptCropper
        sourceUrl={sourceUrl}
        crop={crop}
        onCropChange={(nextCrop) => {
          onCropChange(nextCrop);
          setCrop(nextCrop);
        }}
        imageAlt="Receipt"
        cornerLabel={(corner) => corner}
        tiltDegrees={tilt}
        viewResetKey={viewResetKey}
        rotationX={rotationX}
        rotationY={rotationY}
      />
    );
  }

  const view = render(
    <ControlledCropper
      tilt={tilt}
      viewResetKey={viewResetKey}
      sourceUrl={sourceUrl}
      rotationX={rotationX}
      rotationY={rotationY}
    />,
  );
  const rerender = () =>
    view.rerender(
      <ControlledCropper
        tilt={tilt}
        viewResetKey={viewResetKey}
        sourceUrl={sourceUrl}
        rotationX={rotationX}
        rotationY={rotationY}
      />,
    );
  const frame = document.querySelector<HTMLElement>(
    '[data-slot="receipt-crop-frame"]',
  );
  if (!frame) throw new Error("Crop frame was not rendered");
  if (mockFrame) {
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(rect(200, 400));
  }

  return {
    frame,
    onCropChange,
    setTilt: (next: number) => {
      tilt = next;
      rerender();
    },
    setViewResetKey: (next: number) => {
      viewResetKey = next;
      rerender();
    },
    setSourceUrl: (next: string) => {
      sourceUrl = next;
      rerender();
    },
    setPerspective: (nextX: number, nextY: number) => {
      rotationX = nextX;
      rotationY = nextY;
      rerender();
    },
  };
}

function loadSourceDimensions(width: number, height: number) {
  const image = screen.getByRole("img", { name: "Receipt" });
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  fireEvent.load(image);
}

function expectAllCornersVisible(
  source: HTMLImageElement,
  frame: HTMLElement,
  sourceWidth: number,
  sourceHeight: number,
) {
  const bounds = {
    width: Number.parseFloat(frame.style.width),
    height: Number.parseFloat(frame.style.height),
  };
  const matrix = readMatrix(source);
  expect(Number.parseFloat(source.style.width)).toBe(sourceWidth);
  expect(Number.parseFloat(source.style.height)).toBe(sourceHeight);
  for (const [x, y] of [
    [0, 0],
    [sourceWidth, 0],
    [0, sourceHeight],
    [sourceWidth, sourceHeight],
  ]) {
    const denominator = matrix[3]! * x! + matrix[7]! * y! + matrix[15]!;
    const transformedX =
      (matrix[0]! * x! + matrix[4]! * y! + matrix[12]!) / denominator;
    const transformedY =
      (matrix[1]! * x! + matrix[5]! * y! + matrix[13]!) / denominator;
    expect(denominator).toBeGreaterThan(0);
    expect(transformedX).toBeGreaterThanOrEqual(-1e-8);
    expect(transformedX).toBeLessThanOrEqual(bounds.width + 1e-8);
    expect(transformedY).toBeGreaterThanOrEqual(-1e-8);
    expect(transformedY).toBeLessThanOrEqual(bounds.height + 1e-8);
  }
}

function readMatrix(image: HTMLImageElement) {
  return image.style.transform
    .match(/matrix3d\(([^)]+)\)/)![1]!
    .split(",")
    .map(Number);
}

function cropLoupe() {
  return document.querySelector<HTMLElement>(
    '[data-slot="crop-corner-preview"]',
  );
}

function rect(width: number, height: number, left = 0, top = 0): DOMRect {
  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
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
