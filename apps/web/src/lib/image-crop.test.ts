import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { primitives } from "@repo/theme";
import {
  cropImage,
  cropPixels,
  getTiltedImageGeometry,
  type CropImageOptions,
} from "@repo/ui/lib/crop-image";

describe("image crop export", () => {
  const source = new File(["original image"], "identity.jpg", {
    type: "image/jpeg",
  });
  const fullCrop = { x: 0, y: 0, width: 1, height: 1 };
  const bitmap = { width: 6_000, height: 4_000, close: vi.fn() };
  const context = {
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  };

  beforeEach(() => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["cropped"], { type: "image/jpeg" })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function exportedCanvas() {
    return vi.mocked(HTMLCanvasElement.prototype.getContext).mock
      .contexts[0] as HTMLCanvasElement;
  }

  it.each([
    {
      name: "default",
      options: undefined,
      width: 2_048,
      height: 1_365,
      quality: 0.85,
    },
    {
      name: "identity card",
      options: { maxEdge: 4_096, quality: 0.92 },
      width: 4_096,
      height: 2_731,
      quality: 0.92,
    },
  ])(
    "exports $name detail and JPEG quality",
    async ({ options, width, height, quality }) => {
      await cropImage(source, fullCrop, options);
      const canvas = exportedCanvas();
      expect(canvas.width).toBe(width);
      expect(canvas.height).toBe(height);
      expect(context.drawImage).toHaveBeenCalledWith(
        bitmap,
        0,
        0,
        6_000,
        4_000,
        0,
        0,
        width,
        height,
      );
      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        "image/jpeg",
        quality,
      );
      expect(bitmap.close).toHaveBeenCalledOnce();
    },
  );

  it.each([2_048, 4_096])(
    "does not upscale a crop smaller than %i pixels",
    async (maxEdge) => {
      await cropImage(
        source,
        { x: 0.25, y: 0.25, width: 0.2, height: 0.2 },
        { maxEdge },
      );
      expect(exportedCanvas().width).toBe(1_200);
      expect(exportedCanvas().height).toBe(800);
      expect(context.drawImage).toHaveBeenCalledWith(
        bitmap,
        1_500,
        1_000,
        1_200,
        800,
        0,
        0,
        1_200,
        800,
      );
    },
  );

  it.each([
    {
      turns: 1,
      width: 2_000,
      height: 3_000,
      originalTopLeft: [1_500, 3_000],
      originalBottomRight: [4_500, 1_000],
    },
    {
      turns: 2,
      width: 3_000,
      height: 2_000,
      originalTopLeft: [4_500, 3_000],
      originalBottomRight: [1_500, 1_000],
    },
    {
      turns: 3,
      width: 2_000,
      height: 3_000,
      originalTopLeft: [4_500, 1_000],
      originalBottomRight: [1_500, 3_000],
    },
    {
      turns: -1,
      width: 2_000,
      height: 3_000,
      originalTopLeft: [4_500, 1_000],
      originalBottomRight: [1_500, 3_000],
    },
  ])(
    "crops a $turns-turn preview directly from the original in one pass",
    async ({ turns, width, height, originalTopLeft, originalBottomRight }) => {
      await cropImage(
        source,
        { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        { maxEdge: 4_096, quality: 0.92, quarterTurns: turns },
      );

      const canvas = exportedCanvas();
      expect(canvas.width).toBe(width);
      expect(canvas.height).toBe(height);
      expect(createImageBitmap).toHaveBeenCalledOnce();
      expect(createImageBitmap).toHaveBeenCalledWith(source, {
        imageOrientation: "from-image",
      });
      expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, 0, 0);
      expect(canvas.toBlob).toHaveBeenCalledOnce();

      const [a, b, c, d, e, f] = context.setTransform.mock.calls[0] as number[];
      const transform = ([x, y]: number[]) => [
        a * x + c * y + e,
        b * x + d * y + f,
      ];
      expect(transform(originalTopLeft)).toEqual([0, 0]);
      expect(transform(originalBottomRight)).toEqual([width, height]);
      expect(bitmap.close).toHaveBeenCalledOnce();
    },
  );

  it("downscales the rotated original after mapping the crop", async () => {
    await cropImage(source, fullCrop, { quarterTurns: 1, maxEdge: 4_096 });
    const canvas = exportedCanvas();
    expect(canvas.width).toBe(2_731);
    expect(canvas.height).toBe(4_096);
    const [a, b, c, d, e, f] = context.setTransform.mock.calls[0] as number[];
    expect(a * 0 + c * 4_000 + e).toBeCloseTo(0);
    expect(b * 0 + d * 4_000 + f).toBeCloseTo(0);
    expect(a * 6_000 + c * 0 + e).toBeCloseTo(2_731);
    expect(b * 6_000 + d * 0 + f).toBeCloseTo(4_096);
  });

  it.each([
    { quarterTurns: 0, tiltDegrees: 12.3 },
    { quarterTurns: 1, tiltDegrees: 7.5 },
    { quarterTurns: 1, tiltDegrees: -7.5 },
    { quarterTurns: 2, tiltDegrees: -0.1 },
    { quarterTurns: 3, tiltDegrees: 14.9 },
  ])(
    "straightens a $quarterTurns-turn preview by $tiltDegrees degrees in one source pass",
    async ({ quarterTurns, tiltDegrees }) => {
      const crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
      await cropImage(source, crop, {
        quarterTurns,
        tiltDegrees,
        maxEdge: 4_096,
        quality: 0.92,
      });
      const canvas = exportedCanvas();
      const [a, b, c, d, e, f] = context.setTransform.mock.calls[0] as number[];
      const quarterWidth = quarterTurns % 2 ? bitmap.height : bitmap.width;
      const quarterHeight = quarterTurns % 2 ? bitmap.width : bitmap.height;
      const geometry = getTiltedImageGeometry(
        quarterWidth,
        quarterHeight,
        tiltDegrees,
      );
      const pixels = cropPixels(crop, geometry.width, geometry.height);
      const radians = (tiltDegrees * Math.PI) / 180;

      for (const [x, y] of [
        [0, 0],
        [bitmap.width, bitmap.height],
        [bitmap.width / 2, bitmap.height / 2],
        [1_200, 700],
      ]) {
        const [rotatedX, rotatedY] =
          quarterTurns === 0
            ? [x, y]
            : quarterTurns === 1
              ? [bitmap.height - y, x]
              : quarterTurns === 2
                ? [bitmap.width - x, bitmap.height - y]
                : [y, bitmap.width - x];
        const dx = rotatedX - quarterWidth / 2;
        const dy = rotatedY - quarterHeight / 2;
        const tiltedX =
          geometry.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians);
        const tiltedY =
          geometry.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians);
        expect(a * x + c * y + e).toBeCloseTo(
          ((tiltedX - pixels.x) * canvas.width) / pixels.width,
        );
        expect(b * x + d * y + f).toBeCloseTo(
          ((tiltedY - pixels.y) * canvas.height) / pixels.height,
        );
      }
      expect(context.fillStyle).toBe(primitives.mist[0]);
      expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
        context.setTransform.mock.invocationCallOrder[0],
      );
      expect(createImageBitmap).toHaveBeenCalledExactlyOnceWith(source, {
        imageOrientation: "from-image",
      });
      expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, 0, 0);
      expect(canvas.toBlob).toHaveBeenCalledExactlyOnceWith(
        expect.any(Function),
        "image/jpeg",
        0.92,
      );
      expect(bitmap.close).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { maxEdge: 0 },
    { maxEdge: -10 },
    { maxEdge: 0.5 },
    { maxEdge: Infinity },
    { quality: -0.1 },
    { quality: 1.1 },
    { quality: NaN },
    { quarterTurns: 0.5 },
    { quarterTurns: Infinity },
    { tiltDegrees: NaN },
    { tiltDegrees: Infinity },
    { tiltDegrees: 45.1 },
    { tiltDegrees: -45.1 },
  ] satisfies CropImageOptions[])(
    "rejects invalid options %j before decoding",
    async (options) => {
      await expect(cropImage(source, fullCrop, options)).rejects.toThrow(
        RangeError,
      );
      expect(createImageBitmap).not.toHaveBeenCalled();
    },
  );

  it("releases the decoded original if a combined rotation and crop cannot export", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
      (callback) => callback(null),
    );
    await expect(
      cropImage(source, fullCrop, { quarterTurns: 1, tiltDegrees: 5 }),
    ).rejects.toThrow("Image export failed");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
