/**
 * Shadcn radius scale derived from the selected preset's 0.45rem base.
 * Web emits the equivalent CSS calculations; native consumes these dp values.
 */
export const radiusBase = 7.2;

export const radius = {
  none: 0,
  sm: Math.max(0, radiusBase - 4),
  md: Math.max(0, radiusBase - 2),
  lg: radiusBase,
  xl: radiusBase + 4,
  "2xl": radiusBase + 8,
  "3xl": radiusBase + 12,
  "4xl": radiusBase + 16,
  full: 9999,
} as const;

export type Radius = typeof radius;
