import {
  fitCropPreview,
  previewDeltaToCropDelta,
} from "@repo/ui/lib/crop-preview-layout";
import { describe, expect, it } from "vitest";

const input = {
  viewportWidth: 400,
  viewportHeight: 600,
  imageWidth: 800,
  imageHeight: 1200,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  padding: 32,
};

describe("crop preview layout", () => {
  it("fits the crop between floating controls with small margins while the source extends underneath", () => {
    const crop = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
    const frame = fitCropPreview({
      viewportWidth: 390,
      viewportHeight: 844,
      imageWidth: 1200,
      imageHeight: 800,
      crop,
      padding: 12,
      insets: { top: 72, bottom: 180 },
    })!;
    expect(frame.left + crop.x * frame.width).toBeCloseTo(12);
    expect(frame.left + (crop.x + crop.width) * frame.width).toBeCloseTo(378);
    expect(frame.top + crop.y * frame.height).toBeGreaterThan(72);
    expect(frame.top + (crop.y + crop.height) * frame.height).toBeLessThan(664);
    expect(frame.top).toBeLessThan(0);
    expect(frame.top + frame.height).toBeGreaterThan(844);
  });

  it("respects landscape safe areas without adding them to the image bounds", () => {
    const frame = fitCropPreview({
      ...input,
      viewportWidth: 844,
      viewportHeight: 390,
      crop: { x: 0.4, y: 0.4, width: 0.2, height: 0.1 },
      padding: 12,
      insets: { left: 44, right: 44, top: 60, bottom: 140 },
    })!;
    expect(frame.left + frame.width * 0.4).toBeGreaterThanOrEqual(56);
    expect(frame.left + frame.width * 0.6).toBeLessThanOrEqual(788);
    expect(frame.top + frame.height * 0.4).toBeCloseTo(72);
    expect(frame.top + frame.height * 0.5).toBeCloseTo(238);
  });

  it("fits the full image while leaving space for all corner handles", () => {
    expect(fitCropPreview(input)).toEqual({
      left: 32,
      top: 48,
      width: 336,
      height: 504,
    });
  });

  it("fills the same space with a smaller selected region without altering source coordinates", () => {
    const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const frame = fitCropPreview({ ...input, crop })!;
    expect(frame).toEqual({ left: -136, top: -204, width: 672, height: 1008 });
    expect(frame.left + crop.x * frame.width).toBe(32);
    expect(frame.top + crop.y * frame.height).toBe(48);
    expect(crop).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  });

  it("centers off-center selections without changing their aspect ratio", () => {
    const crop = { x: 0.1, y: 0.45, width: 0.6, height: 0.3 };
    const frame = fitCropPreview({ ...input, crop })!;
    expect(frame.left + (crop.x + crop.width / 2) * frame.width).toBeCloseTo(
      200,
    );
    expect(frame.top + (crop.y + crop.height / 2) * frame.height).toBeCloseTo(
      300,
    );
    expect(frame.width / frame.height).toBeCloseTo(800 / 1200);
    expect(frame.width * crop.width).toBeCloseTo(336);
  });

  it("maps a resized corner back to the same normalized crop regardless of preview zoom", () => {
    const original = fitCropPreview(input)!;
    const focused = fitCropPreview({
      ...input,
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    })!;
    const originalDelta = previewDeltaToCropDelta(33.6, 50.4, original)!;
    const focusedDelta = previewDeltaToCropDelta(67.2, 100.8, focused)!;
    expect(originalDelta.x).toBeCloseTo(0.1);
    expect(originalDelta.y).toBeCloseTo(0.1);
    expect(focusedDelta.x).toBeCloseTo(originalDelta.x);
    expect(focusedDelta.y).toBeCloseTo(originalDelta.y);
  });

  it("uses the expanded tilted bounds without clipping the selected region", () => {
    const crop = { x: 0.08, y: 0.12, width: 0.8, height: 0.65 };
    const frame = fitCropPreview({
      ...input,
      imageWidth: 993,
      imageHeight: 920,
      crop,
    })!;
    expect(frame.width / frame.height).toBeCloseTo(993 / 920);
    expect(frame.left + crop.x * frame.width).toBeCloseTo(32);
    expect(frame.left + (crop.x + crop.width) * frame.width).toBeCloseTo(368);
    expect(frame.top + crop.y * frame.height).toBeGreaterThanOrEqual(32);
    expect(
      frame.top + (crop.y + crop.height) * frame.height,
    ).toBeLessThanOrEqual(568);
  });

  it.each([
    { viewportWidth: 0 },
    { viewportHeight: 0 },
    { imageWidth: 0 },
    { imageHeight: Number.NaN },
    { crop: { x: 0, y: 0, width: 0, height: 1 } },
  ])("waits for valid nonzero layout dimensions: %j", (invalid) => {
    expect(fitCropPreview({ ...input, ...invalid })).toBeNull();
  });

  it("ignores pointer conversion before the image has a measured size", () => {
    expect(previewDeltaToCropDelta(1, 1, { width: 0, height: 0 })).toBeNull();
  });

  it.each([
    [400, 72],
    [80, 450],
  ])(
    "adapts handle clearance to a short or narrow %sx%s viewport",
    (viewportWidth, viewportHeight) => {
      const frame = fitCropPreview({
        ...input,
        viewportWidth,
        viewportHeight,
      })!;
      expect(frame.width).toBeGreaterThan(0);
      expect(frame.height).toBeGreaterThan(0);
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.top).toBeGreaterThanOrEqual(0);
      expect(frame.left + frame.width).toBeLessThanOrEqual(viewportWidth);
      expect(frame.top + frame.height).toBeLessThanOrEqual(viewportHeight);
      expect(Math.min(frame.left, frame.top)).toBeLessThanOrEqual(32);
      expect(
        Math.max(frame.width / viewportWidth, frame.height / viewportHeight),
      ).toBeGreaterThanOrEqual(2 / 3 - 1e-8);
    },
  );
});
