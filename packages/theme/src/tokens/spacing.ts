import { breakpoints } from "./breakpoints";

/**
 * Spacing scale in px (4px base unit).
 * Web emits as rem (px / 16); native consumes as dp (numbers).
 */
const spacingScale = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  16: 64,
  18: 72,
  20: 80,
  24: 96,
  32: 128,
  36: 144,
  48: 192,
  64: 256,
  70: 280,
  72: 288,
  96: 384,
} as const;

/** Screen content breathing room; device safe-area insets are added by the shell. */
export const spacing = {
  ...spacingScale,
  screenBottom: spacingScale[8],
} as const;

export type Spacing = typeof spacing;

/** Maximum width for transactional email content, in px. */
export const emailSizing = { content: 560 } as const;

/** Web sizing for document editors and available-width form layouts. */
export const viewportSizing = {
  primaryFormActions: "minmax(0, 2fr) minmax(0, 3fr)",
  scooterPhotoPreview: "55dvh",
  scooterPhotoPreviewMobile: "35dvh",
  documentEditor: "80vw",
  documentReview: "60dvh",
  formColumns: `${breakpoints.sm}px`,
  formControls: `${spacing[96]}px`,
  booleanRow: "32em",
  accessDirectory: "60dvh",
  accessEditor: "80dvh",
} as const;

/** Border thickness for add buttons and drag-and-drop surfaces. */
export const dashedSurface = { borderWidth: spacing[0.5] } as const;
