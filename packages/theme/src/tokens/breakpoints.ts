/**
 * Breakpoints in px. Web maps to Tailwind screens; native uses the same numbers for
 * responsive logic via Dimensions / useWindowDimensions.
 */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoints = typeof breakpoints;
