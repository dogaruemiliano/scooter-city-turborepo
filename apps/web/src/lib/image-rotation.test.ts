import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rotateImage } from "@repo/ui/lib/crop-image";

describe("image rotation", () => {
  const width = 4_032;
  const height = 3_024;
  const source = new File(["original image"], "identity.jpg", {
    type: "image/jpeg",
  });
  const bitmap = { width, height, close: vi.fn() };
  const context = { setTransform: vi.fn(), drawImage: vi.fn() };

  beforeEach(() => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["rotated"], { type: "image/jpeg" })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([0, 4, -4, 8])("returns the original for %i turns", async (turns) => {
    expect(await rotateImage(source, turns)).toBe(source);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it.each([
    {
      turns: 1,
      outputWidth: height,
      outputHeight: width,
      topLeft: [height, 0],
    },
    {
      turns: 2,
      outputWidth: width,
      outputHeight: height,
      topLeft: [width, height],
    },
    { turns: 3, outputWidth: height, outputHeight: width, topLeft: [0, width] },
    {
      turns: -1,
      outputWidth: height,
      outputHeight: width,
      topLeft: [0, width],
    },
    {
      turns: 5,
      outputWidth: height,
      outputHeight: width,
      topLeft: [height, 0],
    },
  ])(
    "preserves every original pixel's bounds for $turns quarter turns",
    async ({ turns, outputWidth, outputHeight, topLeft }) => {
      const rotated = await rotateImage(source, turns);
      const canvas = vi.mocked(HTMLCanvasElement.prototype.getContext).mock
        .contexts[0] as HTMLCanvasElement;

      expect(createImageBitmap).toHaveBeenCalledWith(source, {
        imageOrientation: "from-image",
      });
      expect(canvas.width).toBe(outputWidth);
      expect(canvas.height).toBe(outputHeight);
      expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);

      const [a, b, c, d, e, f] = context.setTransform.mock.calls[0] as number[];
      const transform = ([x, y]: number[]) => [
        a * x + c * y + e,
        b * x + d * y + f,
      ];
      const corners = [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
      ].map(transform);
      expect(transform([0, 0])).toEqual(topLeft);
      expect(Math.min(...corners.map(([x]) => x))).toBe(0);
      expect(Math.max(...corners.map(([x]) => x))).toBe(outputWidth);
      expect(Math.min(...corners.map(([, y]) => y))).toBe(0);
      expect(Math.max(...corners.map(([, y]) => y))).toBe(outputHeight);
      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        "image/jpeg",
        0.85,
      );
      expect(rotated.name).toBe("identity-rotated.jpg");
      expect(rotated.type).toBe("image/jpeg");
      expect(bitmap.close).toHaveBeenCalledOnce();
    },
  );

  it("releases the decoded image when the canvas is unavailable", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    await expect(rotateImage(source, 1)).rejects.toThrow(
      "Canvas is unavailable",
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("allows higher JPEG quality for identity previews", async () => {
    await rotateImage(source, 1, { quality: 0.92 });
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.92,
    );
  });

  it.each([-0.1, 1.1, Number.NaN])(
    "rejects invalid JPEG quality %s",
    async (quality) => {
      await expect(rotateImage(source, 1, { quality })).rejects.toThrow(
        "Image quality",
      );
      expect(createImageBitmap).not.toHaveBeenCalled();
    },
  );

  it("releases the decoded image when export fails", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
      (callback) => callback(null),
    );
    await expect(rotateImage(source, 1)).rejects.toThrow("Image export failed");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("releases the decoded image when drawing fails", async () => {
    context.drawImage.mockImplementationOnce(() => {
      throw new Error("draw failed");
    });
    await expect(rotateImage(source, 1)).rejects.toThrow("draw failed");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid turns %s before decoding",
    async (turns) => {
      await expect(rotateImage(source, turns)).rejects.toThrow(
        "whole quarter turns",
      );
      expect(createImageBitmap).not.toHaveBeenCalled();
    },
  );
});
