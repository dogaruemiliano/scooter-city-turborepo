import { fitCameraPreview } from "@repo/ui/lib/camera-preview-layout";
import { describe, expect, it } from "vitest";

const portraitPhone = {
  containerWidth: 390,
  containerHeight: 844,
  sourceWidth: 1080,
  sourceHeight: 1440,
  topControlsHeight: 80,
  bottomControlsHeight: 176,
  gap: 16,
};

describe("fitCameraPreview", () => {
  it("uses the complete portrait camera frame and places it between controls when it fits", () => {
    const frame = fitCameraPreview(portraitPhone)!;

    expect(frame.width).toBeCloseTo(390);
    expect(frame.height).toBeCloseTo(520);
    expect(frame.left).toBeCloseTo(0);
    expect(frame.top).toBeGreaterThanOrEqual(96);
    expect(frame.top + frame.height).toBeLessThanOrEqual(652);
    expect(frame.guideTopInset).toBe(0);
    expect(frame.guideBottomInset).toBe(0);
  });

  it("overlays controls without shrinking a camera frame that fills the display", () => {
    const input = {
      ...portraitPhone,
      containerWidth: 360,
      containerHeight: 640,
      sourceWidth: 1080,
      sourceHeight: 1920,
    };
    const frame = fitCameraPreview(input)!;

    expect(frame.left).toBe(0);
    expect(frame.top).toBe(0);
    expect(frame.width).toBe(360);
    expect(frame.height).toBe(640);
    expect(frame.guideTopInset).toBe(96);
    expect(frame.guideBottomInset).toBe(192);
  });

  it("centers a tall camera frame when the full-size preview cannot clear both controls", () => {
    const input = { ...portraitPhone, sourceHeight: 1920 };
    const frame = fitCameraPreview(input)!;

    expect(frame.width).toBeCloseTo(input.containerWidth);
    expect(frame.height).toBeCloseTo(693.3333333333);
    expect(frame.top).toBeCloseTo((input.containerHeight - frame.height) / 2);
    expect(frame.guideTopInset).toBeCloseTo(96 - frame.top);
    expect(frame.guideBottomInset).toBeCloseTo(frame.top + frame.height - 652);
  });

  it("letterboxes a landscape camera without cropping its left and right edges", () => {
    const input = {
      ...portraitPhone,
      containerWidth: 844,
      containerHeight: 390,
      sourceWidth: 1920,
      sourceHeight: 1080,
    };
    const frame = fitCameraPreview(input)!;

    expect(frame.width).toBeCloseTo(693.3333333333);
    expect(frame.height).toBeCloseTo(390);
    expect(frame.left).toBeCloseTo((input.containerWidth - frame.width) / 2);
    expect(frame.top).toBe(0);
  });

  it("keeps the same maximum camera size when controls become taller", () => {
    const unobstructed = fitCameraPreview({
      ...portraitPhone,
      topControlsHeight: 0,
      bottomControlsHeight: 0,
      gap: 0,
    })!;
    const overlaid = fitCameraPreview({
      ...portraitPhone,
      topControlsHeight: 150,
      bottomControlsHeight: 250,
    })!;

    expect(overlaid.width).toBe(unobstructed.width);
    expect(overlaid.height).toBe(unobstructed.height);
    expect(overlaid.top).toBeCloseTo(
      (portraitPhone.containerHeight - overlaid.height) / 2,
    );
  });

  it.each([
    "containerWidth",
    "containerHeight",
    "sourceWidth",
    "sourceHeight",
  ] as const)(
    "waits for a nonzero %s before laying out the camera",
    (dimension) => {
      expect(fitCameraPreview({ ...portraitPhone, [dimension]: 0 })).toBeNull();
    },
  );

  it.each([
    [320, 568, 480, 640],
    [430, 932, 1440, 1920],
    [932, 430, 1920, 1440],
    [1280, 720, 640, 480],
    [768, 1024, 1920, 1080],
  ])(
    "preserves aspect and all source pixels in a %sx%s display with a %sx%s camera",
    (containerWidth, containerHeight, sourceWidth, sourceHeight) => {
      const input = {
        ...portraitPhone,
        containerWidth,
        containerHeight,
        sourceWidth,
        sourceHeight,
      };
      const frame = fitCameraPreview(input)!;
      const maximumScale = Math.min(
        containerWidth / sourceWidth,
        containerHeight / sourceHeight,
      );

      expect(frame.width / frame.height).toBeCloseTo(
        sourceWidth / sourceHeight,
      );
      expect(frame.width).toBeCloseTo(sourceWidth * maximumScale);
      expect(frame.height).toBeCloseTo(sourceHeight * maximumScale);
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.top).toBeGreaterThanOrEqual(0);
      expect(frame.left + frame.width).toBeLessThanOrEqual(
        containerWidth + 1e-8,
      );
      expect(frame.top + frame.height).toBeLessThanOrEqual(
        containerHeight + 1e-8,
      );
      expect(frame.guideTopInset).toBeGreaterThanOrEqual(0);
      expect(frame.guideBottomInset).toBeGreaterThanOrEqual(0);
    },
  );
});
