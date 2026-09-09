export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_RECEIPT_CROP: CropRect = {
  x: 0.04,
  y: 0.04,
  width: 0.92,
  height: 0.92,
};

const MAX_RECEIPT_EDGE = 2_048;
const RECEIPT_JPEG_QUALITY = 0.85;
const MIN_CROP_SIZE = 0.15;

export type CropCorner =
  | "north-west"
  | "north-east"
  | "south-west"
  | "south-east";

export function resizeCropRect(
  initial: CropRect,
  corner: CropCorner,
  deltaX: number,
  deltaY: number,
): CropRect {
  const left = initial.x;
  const top = initial.y;
  const right = initial.x + initial.width;
  const bottom = initial.y + initial.height;

  const nextLeft = corner.endsWith("west")
    ? clamp(left + deltaX, 0, right - MIN_CROP_SIZE)
    : left;
  const nextRight = corner.endsWith("east")
    ? clamp(right + deltaX, left + MIN_CROP_SIZE, 1)
    : right;
  const nextTop = corner.startsWith("north")
    ? clamp(top + deltaY, 0, bottom - MIN_CROP_SIZE)
    : top;
  const nextBottom = corner.startsWith("south")
    ? clamp(bottom + deltaY, top + MIN_CROP_SIZE, 1)
    : bottom;

  return {
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  };
}

export function cropPixels(
  crop: CropRect,
  imageWidth: number,
  imageHeight: number,
) {
  const x = Math.round(clamp(crop.x, 0, 1) * imageWidth);
  const y = Math.round(clamp(crop.y, 0, 1) * imageHeight);
  const width = Math.max(
    1,
    Math.round(clamp(crop.width, 0, 1 - crop.x) * imageWidth),
  );
  const height = Math.max(
    1,
    Math.round(clamp(crop.height, 0, 1 - crop.y) * imageHeight),
  );

  return {
    x,
    y,
    width: Math.min(width, imageWidth - x),
    height: Math.min(height, imageHeight - y),
  };
}

/**
 * Crops and downscales in the browser before any network call. The output is
 * always a JPEG so large phone photos do not reach S3 or Textract unchanged.
 */
export async function cropReceiptImage(
  source: File,
  crop: CropRect,
): Promise<File> {
  const decoded = await decodeImage(source);

  try {
    const pixels = cropPixels(crop, decoded.width, decoded.height);
    const scale = Math.min(
      1,
      MAX_RECEIPT_EDGE / Math.max(pixels.width, pixels.height),
    );
    const outputWidth = Math.max(1, Math.round(pixels.width * scale));
    const outputHeight = Math.max(1, Math.round(pixels.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      decoded.source,
      pixels.x,
      pixels.y,
      pixels.width,
      pixels.height,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image export failed")),
        "image/jpeg",
        RECEIPT_JPEG_QUALITY,
      );
    });
    const baseName = source.name.replace(/\.[^.]+$/, "") || "receipt";
    return new File([blob], `${baseName}-cropped.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.dispose();
  }
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(url),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
