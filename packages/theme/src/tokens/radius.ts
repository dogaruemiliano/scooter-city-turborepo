/**
 * Border radius scale in px. Web emits as rem; native consumes as numbers.
 */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 24,
  pill: 9999,
} as const;

export type Radius = typeof radius;
