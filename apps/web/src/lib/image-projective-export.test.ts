import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cropImage,
  cropPixels,
  getProjectedImageGeometry,
} from "@repo/ui/lib/crop-image";
import {
  invertHomography,
  projectImagePoint,
} from "@repo/ui/lib/projective-image";

describe("saved image perspective", () => {
  const source = new File(["original"], "identity.jpg", { type: "image/jpeg" });
  const bitmap = { width: 32, height: 24, close: vi.fn() };
  const originalPixels = gradientPixels(bitmap.width, bitmap.height);
  let contexts: ReturnType<typeof canvasContext>[];
  let canvases: HTMLCanvasElement[];

  beforeEach(() => {
    contexts = [];
    canvases = [];
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        canvases.push(this);
        const context = canvasContext(contexts.length > 0);
        contexts.push(context);
        return context as unknown as CanvasRenderingContext2D;
      } as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["saved"], { type: "image/jpeg" })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { quarterTurns: 0, rotationX: 30, rotationY: 0, tiltDegrees: 0 },
    { quarterTurns: 0, rotationX: 0, rotationY: -25, tiltDegrees: 0 },
    { quarterTurns: 1, rotationX: 23, rotationY: -18, tiltDegrees: 7.5 },
    { quarterTurns: 2, rotationX: -45, rotationY: 45, tiltDegrees: -15 },
    { quarterTurns: 3, rotationX: 12, rotationY: 14, tiltDegrees: 11 },
    {
      quarterTurns: 0,
      rotationX: 30,
      rotationY: 0,
      tiltDegrees: 0,
      fixedFrame: true,
    },
    {
      quarterTurns: 0,
      rotationX: 0,
      rotationY: -25,
      tiltDegrees: 0,
      fixedFrame: true,
    },
    {
      quarterTurns: 1,
      rotationX: 23,
      rotationY: -18,
      tiltDegrees: 7.5,
      fixedFrame: true,
    },
  ])(
    "saves original pixels with the same XYZ projection as preview %j",
    async (options) => {
      const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      const result = await cropImage(source, crop, {
        ...options,
        quality: 0.92,
        maxEdge: 4_096,
      });
      const geometry = getProjectedImageGeometry(
        options.quarterTurns % 2 ? bitmap.height : bitmap.width,
        options.quarterTurns % 2 ? bitmap.width : bitmap.height,
        options,
      );
      const cropRect = cropPixels(crop, geometry.width, geometry.height);
      const output = contexts[0].putImageData.mock.calls[0][0] as ImageData;
      expect(output.width).toBe(cropRect.width);
      expect(output.height).toBe(cropRect.height);
      const inversePreview = invertHomography(geometry.homography);
      let compared = 0;
      for (let y = 0; y < output.height; y += 3) {
        for (let x = 0; x < output.width; x += 3) {
          const [qx, qy] = projectImagePoint(
            inversePreview,
            cropRect.x + x + 0.5,
            cropRect.y + y + 0.5,
          );
          const [sx, sy] =
            options.quarterTurns === 0
              ? [qx, qy]
              : options.quarterTurns === 1
                ? [qy, bitmap.height - qx]
                : options.quarterTurns === 2
                  ? [bitmap.width - qx, bitmap.height - qy]
                  : [bitmap.width - qy, qx];
          if (
            sx < 0.5 ||
            sy < 0.5 ||
            sx >= bitmap.width - 0.5 ||
            sy >= bitmap.height - 0.5
          )
            continue;
          const offset = (y * output.width + x) * 4;
          expect(output.data[offset]).toBeCloseTo(
            Math.round((sx - 0.5) * 4),
            0,
          );
          expect(output.data[offset + 1]).toBeCloseTo(
            Math.round((sy - 0.5) * 8),
            0,
          );
          expect(output.data[offset + 2]).toBe(0);
          expect(output.data[offset + 3]).toBe(255);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(10);
      expect(createImageBitmap).toHaveBeenCalledExactlyOnceWith(source, {
        imageOrientation: "from-image",
      });
      expect(contexts[1].drawImage).toHaveBeenCalledExactlyOnceWith(
        bitmap,
        0,
        0,
      );
      expect(contexts[0].drawImage).not.toHaveBeenCalled();
      expect(
        HTMLCanvasElement.prototype.toBlob,
      ).toHaveBeenCalledExactlyOnceWith(
        expect.any(Function),
        "image/jpeg",
        0.92,
      );
      expect(canvases[1].width).toBe(0);
      expect(canvases[1].height).toBe(0);
      expect(bitmap.close).toHaveBeenCalledOnce();
      expect(result.type).toBe("image/jpeg");
    },
  );

  it("retains the fast Canvas2D route when both perspective axes are reset", async () => {
    await cropImage(
      source,
      { x: 0, y: 0, width: 1, height: 1 },
      { rotationX: 0, rotationY: 0 },
    );
    expect(contexts).toHaveLength(1);
    expect(contexts[0].drawImage).toHaveBeenCalledOnce();
    expect(contexts[0].getImageData).not.toHaveBeenCalled();
    expect(contexts[0].putImageData).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])(
    "exports tilt within a fixed frame after %i quarter turns",
    async (quarterTurns) => {
      const tiltDegrees = 12;
      await cropImage(
        source,
        { x: 0, y: 0, width: 1, height: 1 },
        {
          quarterTurns,
          tiltDegrees,
          fixedFrame: true,
        },
      );
      const width = quarterTurns % 2 ? bitmap.height : bitmap.width;
      const height = quarterTurns % 2 ? bitmap.width : bitmap.height;
      expect(canvases[0].width).toBe(width);
      expect(canvases[0].height).toBe(height);
      const [a, b, c, d, e, f] = contexts[0].setTransform.mock
        .calls[0] as number[];
      expect((a * bitmap.width) / 2 + (c * bitmap.height) / 2 + e).toBeCloseTo(
        width / 2,
      );
      expect((b * bitmap.width) / 2 + (d * bitmap.height) / 2 + f).toBeCloseTo(
        height / 2,
      );
      const radians = ((tiltDegrees + quarterTurns * 90) * Math.PI) / 180;
      expect(a).toBeCloseTo(Math.cos(radians));
      expect(b).toBeCloseTo(Math.sin(radians));
      expect(c).toBeCloseTo(-Math.sin(radians));
      expect(d).toBeCloseTo(Math.cos(radians));
      expect(contexts[0].drawImage).toHaveBeenCalledExactlyOnceWith(
        bitmap,
        0,
        0,
      );
    },
  );

  it("disposes decoded pixels and temporary canvas when readback fails", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(
      function (this: HTMLCanvasElement) {
        canvases.push(this);
        const context = canvasContext(contexts.length > 0);
        if (contexts.length > 0)
          context.getImageData.mockImplementation(() => {
            throw new Error("readback failed");
          });
        contexts.push(context);
        return context as unknown as CanvasRenderingContext2D;
      } as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    await expect(
      cropImage(source, { x: 0, y: 0, width: 1, height: 1 }, { rotationX: 5 }),
    ).rejects.toThrow("readback failed");
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvases[1].width).toBe(0);
    expect(canvases[1].height).toBe(0);
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it.each([{ rotationX: NaN }, { rotationY: 46 }, { rotationX: -46 }])(
    "rejects invalid rotations before decoding %j",
    async (options) => {
      await expect(
        cropImage(source, { x: 0, y: 0, width: 1, height: 1 }, options),
      ).rejects.toThrow(RangeError);
      expect(createImageBitmap).not.toHaveBeenCalled();
    },
  );

  function canvasContext(isSource: boolean) {
    return {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
      getImageData: vi.fn(
        (_x: number, _y: number, width: number, height: number) =>
          isSource
            ? originalPixels
            : ({
                width,
                height,
                data: new Uint8ClampedArray(width * height * 4).fill(255),
                colorSpace: "srgb",
              } as ImageData),
      ),
      putImageData: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillStyle: "",
    };
  }
});

function gradientPixels(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = x * 4;
      data[offset + 1] = y * 8;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}
