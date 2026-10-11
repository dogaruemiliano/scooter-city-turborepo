/**
 * Magnification levels for image-detail helpers.
 */
export const magnification = {
  loupe: 2,
  documentMax: 4,
  documentStep: 0.5,
} as const;

export type Magnification = typeof magnification;
