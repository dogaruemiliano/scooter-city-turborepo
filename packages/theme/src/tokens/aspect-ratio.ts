/**
 * Content aspect ratios expressed as width / height.
 * Shared numeric values also map directly to React Native's aspectRatio.
 */
export const aspectRatio = {
  receiptPortrait: 1 / 3,
} as const;

export type AspectRatio = typeof aspectRatio;
