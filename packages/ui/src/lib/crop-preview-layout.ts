import type { CropRect } from "./crop-image";

export interface CropPreviewLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Fit a normalized selection visually; the crop always stays in source coordinates. */
export function fitCropPreview({
  viewportWidth,
  viewportHeight,
  imageWidth,
  imageHeight,
  crop,
  padding,
  insets = {},
}: {
  viewportWidth: number;
  viewportHeight: number;
  imageWidth: number;
  imageHeight: number;
  crop: CropRect;
  padding: number;
  insets?: { top?: number; bottom?: number; left?: number; right?: number };
}): CropPreviewLayout | null {
  if (
    ![
      viewportWidth,
      viewportHeight,
      imageWidth,
      imageHeight,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      padding,
    ].every(Number.isFinite) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    crop.width <= 0 ||
    crop.height <= 0
  )
    return null;

  const top = Math.max(0, insets.top ?? 0);
  const bottom = Math.max(0, insets.bottom ?? 0);
  const left = Math.max(0, insets.left ?? 0);
  const right = Math.max(0, insets.right ?? 0);
  const availableWidth = viewportWidth - left - right;
  const availableHeight = viewportHeight - top - bottom;
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(availableHeight) ||
    availableWidth <= 0 ||
    availableHeight <= 0
  )
    return null;
  const inset = Math.min(padding, availableWidth / 6, availableHeight / 6);
  const scale = Math.min(
    (availableWidth - inset * 2) / (imageWidth * crop.width),
    (availableHeight - inset * 2) / (imageHeight * crop.height),
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    left: left + (availableWidth - width * crop.width) / 2 - width * crop.x,
    top: top + (availableHeight - height * crop.height) / 2 - height * crop.y,
    width,
    height,
  };
}

/** Convert a screen-space gesture to the unchanged, normalized source coordinate space. */
export function previewDeltaToCropDelta(
  deltaX: number,
  deltaY: number,
  frame: Pick<CropPreviewLayout, "width" | "height">,
) {
  if (frame.width <= 0 || frame.height <= 0) return null;
  return { x: deltaX / frame.width, y: deltaY / frame.height };
}
