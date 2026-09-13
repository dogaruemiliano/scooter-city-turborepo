import { primitives } from "@repo/theme";

import {
  composeHomographies,
  invertHomography,
  projectImagePoint,
  resampleProjectedImage,
  type Homography,
} from "./projective-image";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropImageOptions {
  maxEdge?: number;
  quality?: number;
  /** Clockwise rotation of the original; crop coordinates use the rotated image. */
  quarterTurns?: number;
  /** Clockwise straightening after quarter turns; crop uses the tilted bounds. */
  tiltDegrees?: number;
  /** Perspective rotations, applied X then Y before the final clockwise tilt. */
  rotationX?: number;
  rotationY?: number;
  /** Keep crop coordinates in the quarter-turned source frame during corrections. */
  fixedFrame?: boolean;
}

export interface RotateImageOptions {
  quality?: number;
}

type ImageTransform = [number, number, number, number, number, number];

export interface TiltedImageGeometry {
  width: number;
  height: number;
  matrix: ImageTransform;
}

export interface ImageProjection {
  rotationX?: number;
  rotationY?: number;
  tiltDegrees?: number;
  fixedFrame?: boolean;
}

export interface ProjectedImageGeometry {
  width: number;
  height: number;
  homography: Homography;
  /** Column-major CSS matrix3d; use transform-origin: 0 0 on natural image dimensions. */
  matrix3d: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

export function getProjectedImageGeometry(
  width: number,
  height: number,
  projection: ImageProjection = {},
): ProjectedImageGeometry {
  if (projection.fixedFrame) {
    const transformed = getProjectedImageGeometry(width, height, {
      ...projection,
      fixedFrame: false,
    });
    const [centerX, centerY] = projectImagePoint(
      transformed.homography,
      width / 2,
      height / 2,
    );
    return projectedGeometry(
      width,
      height,
      composeHomographies(
        [1, 0, width / 2 - centerX, 0, 1, height / 2 - centerY, 0, 0, 1],
        transformed.homography,
      ),
    );
  }
  const tilt = getTiltedImageGeometry(
    width,
    height,
    projection.tiltDegrees ?? 0,
  );
  const rotationX = imageTilt(projection.rotationX ?? 0);
  const rotationY = imageTilt(projection.rotationY ?? 0);
  if (rotationX === 0 && rotationY === 0) {
    return projectedGeometry(
      tilt.width,
      tilt.height,
      affineHomography(tilt.matrix),
    );
  }

  const rx = (rotationX * Math.PI) / 180;
  const ry = (rotationY * Math.PI) / 180;
  const rz = ((projection.tiltDegrees ?? 0) * Math.PI) / 180;
  const sx = Math.sin(rx),
    cx = Math.cos(rx);
  const sy = Math.sin(ry),
    cy = Math.cos(ry);
  const sz = Math.sin(rz),
    cz = Math.cos(rz);
  // Rotate the centered plane X -> Y -> Z, then project with positive Z toward us.
  // This distance keeps every corner safely in front of the projection horizon.
  const distance = 2 * Math.max(width, height);
  const centered: Homography = [
    cz * cy,
    cz * sy * sx - sz * cx,
    0,
    sz * cy,
    sz * sy * sx + cz * cx,
    0,
    sy / distance,
    -(cy * sx) / distance,
    1,
  ];
  const unbounded = composeHomographies(centered, [
    1,
    0,
    -width / 2,
    0,
    1,
    -height / 2,
    0,
    0,
    1,
  ]);
  const sourceCorners: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  const corners = sourceCorners.map(([x, y]) =>
    projectImagePoint(unbounded, x, y),
  );
  const left = Math.min(...corners.map(([x]) => x));
  const top = Math.min(...corners.map(([, y]) => y));
  const spanX = Math.max(...corners.map(([x]) => x)) - left;
  const spanY = Math.max(...corners.map(([, y]) => y)) - top;
  const outputWidth = Math.ceil(spanX);
  const outputHeight = Math.ceil(spanY);
  const offsetX = -left + (outputWidth - spanX) / 2;
  const offsetY = -top + (outputHeight - spanY) / 2;
  return projectedGeometry(
    outputWidth,
    outputHeight,
    composeHomographies([1, 0, offsetX, 0, 1, offsetY, 0, 0, 1], unbounded),
  );
}

function projectedGeometry(
  width: number,
  height: number,
  h: Homography,
): ProjectedImageGeometry {
  return {
    width,
    height,
    homography: h,
    matrix3d: [
      h[0],
      h[3],
      0,
      h[6],
      h[1],
      h[4],
      0,
      h[7],
      0,
      0,
      1,
      0,
      h[2],
      h[5],
      0,
      h[8],
    ],
  };
}

function affineHomography([a, b, c, d, e, f]: ImageTransform): Homography {
  return [a, c, e, b, d, f, 0, 0, 1];
}

/** Full image bounds and a canvas/CSS matrix with clockwise tilt about its center. */
export function getTiltedImageGeometry(
  width: number,
  height: number,
  tiltDegrees: number,
): TiltedImageGeometry {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError("Image dimensions must be finite and positive");
  }
  const tilt = imageTilt(tiltDegrees);
  if (tilt === 0) return { width, height, matrix: [1, 0, 0, 1, 0, 0] };

  const radians = (tilt * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const outputWidth = Math.ceil(
    Math.abs(width * cosine) + Math.abs(height * sine),
  );
  const outputHeight = Math.ceil(
    Math.abs(width * sine) + Math.abs(height * cosine),
  );

  return {
    width: outputWidth,
    height: outputHeight,
    matrix: [
      cosine,
      sine,
      -sine,
      cosine,
      outputWidth / 2 - (cosine * width) / 2 + (sine * height) / 2,
      outputHeight / 2 - (sine * width) / 2 - (cosine * height) / 2,
    ],
  };
}

export const DEFAULT_IMAGE_CROP: CropRect = {
  x: 0.04,
  y: 0.04,
  width: 0.92,
  height: 0.92,
};

// Keep existing document and receipt consumers compatible.
export const DEFAULT_RECEIPT_CROP = DEFAULT_IMAGE_CROP;

const MAX_IMAGE_EDGE = 2_048;
const IMAGE_JPEG_QUALITY = 0.85;
const MIN_CROP_SIZE = 0.15;

export type CropCorner =
  | "north-west"
  | "north-east"
  | "south-west"
  | "south-east";

export type CropEdge = "north" | "south" | "west" | "east";
export type CropHandle = CropCorner | CropEdge;

export function resizeCropRect(
  initial: CropRect,
  corner: CropHandle,
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
 * always a JPEG so large phone photos are resized before upload.
 */
export async function cropImage(
  source: File,
  crop: CropRect,
  options: CropImageOptions = {},
): Promise<File> {
  const maxEdge = options.maxEdge ?? MAX_IMAGE_EDGE;
  if (!Number.isInteger(maxEdge) || maxEdge < 1) {
    throw new RangeError("Image maximum edge must be a positive integer");
  }
  const quality = imageQuality(options.quality);
  const turns = normalizeQuarterTurns(options.quarterTurns ?? 0);
  const tilt = imageTilt(options.tiltDegrees ?? 0);
  const rotationX = imageTilt(options.rotationX ?? 0);
  const rotationY = imageTilt(options.rotationY ?? 0);
  const hasPerspective = rotationX !== 0 || rotationY !== 0;
  const decoded = await decodeImage(source);

  try {
    const swapsDimensions = turns % 2 !== 0;
    const geometry = getProjectedImageGeometry(
      swapsDimensions ? decoded.height : decoded.width,
      swapsDimensions ? decoded.width : decoded.height,
      {
        tiltDegrees: tilt,
        rotationX,
        rotationY,
        fixedFrame: options.fixedFrame,
      },
    );
    const pixels = cropPixels(crop, geometry.width, geometry.height);
    const scale = Math.min(1, maxEdge / Math.max(pixels.width, pixels.height));
    const outputWidth = Math.max(1, Math.round(pixels.width * scale));
    const outputHeight = Math.max(1, Math.round(pixels.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (tilt !== 0 || hasPerspective) {
      // JPEG has no alpha; fill any uncovered corners with an opaque backdrop.
      context.fillStyle = primitives.mist[0];
      context.fillRect(0, 0, outputWidth, outputHeight);
    }
    if (hasPerspective) {
      const scaleX = outputWidth / pixels.width;
      const scaleY = outputHeight / pixels.height;
      const sourceToOutput = composeHomographies(
        [scaleX, 0, -pixels.x * scaleX, 0, scaleY, -pixels.y * scaleY, 0, 0, 1],
        composeHomographies(
          geometry.homography,
          affineHomography(
            rotationMatrix(turns, decoded.width, decoded.height),
          ),
        ),
      );
      const sourceCanvas = document.createElement("canvas");
      try {
        sourceCanvas.width = decoded.width;
        sourceCanvas.height = decoded.height;
        const sourceContext = sourceCanvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!sourceContext) throw new Error("Canvas is unavailable");
        sourceContext.drawImage(decoded.source, 0, 0);
        const sourcePixels = sourceContext.getImageData(
          0,
          0,
          decoded.width,
          decoded.height,
        );
        // The readback owns its bytes, so release the extra canvas before resampling.
        sourceCanvas.width = 0;
        sourceCanvas.height = 0;
        const outputPixels = context.getImageData(
          0,
          0,
          outputWidth,
          outputHeight,
        );
        await resampleProjectedImage(
          sourcePixels,
          outputPixels,
          invertHomography(sourceToOutput),
        );
        context.putImageData(outputPixels, 0, 0);
      } finally {
        sourceCanvas.width = 0;
        sourceCanvas.height = 0;
      }
    } else if (turns === 0 && tilt === 0) {
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
    } else {
      // Rotate, position the crop, and scale the original in one rendering pass.
      const h = geometry.homography;
      const [a, b, c, d, e, f] = composeImageTransforms(
        [h[0], h[3], h[1], h[4], h[2], h[5]],
        rotationMatrix(turns, decoded.width, decoded.height),
      );
      const scaleX = outputWidth / pixels.width;
      const scaleY = outputHeight / pixels.height;
      context.setTransform(
        a * scaleX,
        b * scaleY,
        c * scaleX,
        d * scaleY,
        (e - pixels.x) * scaleX,
        (f - pixels.y) * scaleY,
      );
      context.drawImage(decoded.source, 0, 0);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image export failed")),
        "image/jpeg",
        quality,
      );
    });
    const baseName = source.name.replace(/\.[^.]+$/, "") || "document";
    return new File([blob], `${baseName}-cropped.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.dispose();
  }
}

/** Rotates the original image clockwise without cropping or downscaling it. */
export async function rotateImage(
  source: File,
  quarterTurns: number,
  options: RotateImageOptions = {},
): Promise<File> {
  const quality = imageQuality(options.quality);
  const turns = normalizeQuarterTurns(quarterTurns);
  if (turns === 0) return source;

  const decoded = await decodeImage(source);
  try {
    const canvas = document.createElement("canvas");
    const swapsDimensions = turns % 2 !== 0;
    canvas.width = swapsDimensions ? decoded.height : decoded.width;
    canvas.height = swapsDimensions ? decoded.width : decoded.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");

    context.setTransform(
      ...rotationMatrix(turns, decoded.width, decoded.height),
    );
    context.drawImage(decoded.source, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image export failed")),
        "image/jpeg",
        quality,
      );
    });
    const baseName = source.name.replace(/\.[^.]+$/, "") || "document";
    return new File([blob], `${baseName}-rotated.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.dispose();
  }
}

function normalizeQuarterTurns(quarterTurns: number): number {
  if (!Number.isInteger(quarterTurns)) {
    throw new RangeError("Image rotation requires whole quarter turns");
  }
  return ((quarterTurns % 4) + 4) % 4;
}

function imageQuality(quality = IMAGE_JPEG_QUALITY): number {
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new RangeError("Image quality must be between zero and one");
  }
  return quality;
}

function imageTilt(tiltDegrees: number): number {
  if (!Number.isFinite(tiltDegrees) || Math.abs(tiltDegrees) > 45) {
    throw new RangeError("Image tilt must be between -45 and 45 degrees");
  }
  return tiltDegrees;
}

/** Applies the second transform first, followed by the first transform. */
function composeImageTransforms(
  [a, b, c, d, e, f]: ImageTransform,
  [g, h, i, j, k, l]: ImageTransform,
): ImageTransform {
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

// Exact quarter-turn matrices keep all four original corners in bounds.
function rotationMatrix(
  turns: number,
  width: number,
  height: number,
): ImageTransform {
  if (turns === 0) return [1, 0, 0, 1, 0, 0];
  if (turns === 1) return [0, 1, -1, 0, height, 0];
  if (turns === 2) return [-1, 0, 0, -1, width, height];
  return [0, -1, 1, 0, 0, width];
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
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
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
