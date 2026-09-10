/**
 * Magnification levels for image-detail helpers.
 */
export const magnification = {
  loupe: 2,
} as const;

export type Magnification = typeof magnification;
