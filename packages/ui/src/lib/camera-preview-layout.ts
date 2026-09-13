export interface CameraPreviewLayoutInput {
  containerWidth: number;
  containerHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  topControlsHeight: number;
  bottomControlsHeight: number;
  gap: number;
}

/** Fit the entire camera frame first, then use letterboxing for controls. */
export function fitCameraPreview(input: CameraPreviewLayoutInput) {
  const {
    containerWidth,
    containerHeight,
    sourceWidth,
    sourceHeight,
    topControlsHeight,
    bottomControlsHeight,
    gap,
  } = input;
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  )
    return null;
  const scale = Math.min(
    containerWidth / sourceWidth,
    containerHeight / sourceHeight,
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const spareHeight = containerHeight - height;
  const top =
    spareHeight >= topControlsHeight + bottomControlsHeight + gap * 2
      ? Math.max(
          topControlsHeight + gap,
          Math.min(spareHeight / 2, spareHeight - bottomControlsHeight - gap),
        )
      : spareHeight / 2;
  const guideTopInset = Math.min(
    height,
    Math.max(0, topControlsHeight + gap - top),
  );
  const guideBottomInset = Math.min(
    height - guideTopInset,
    Math.max(0, top + height - (containerHeight - bottomControlsHeight - gap)),
  );
  return {
    left: (containerWidth - width) / 2,
    top,
    width,
    height,
    guideTopInset,
    guideBottomInset,
  };
}
