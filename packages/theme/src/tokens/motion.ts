/**
 * Motion tokens. Durations in ms; easings as cubic-bezier (web) — RN consumers can use the same
 * curve via Reanimated's Easing.bezier(...).
 */
export const motion = {
  duration: {
    instant: 0,
    fast: 150,
    normal: 250,
    slow: 400,
    slower: 600,
  },
  easing: {
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    decelerate: "cubic-bezier(0, 0, 0.2, 1)",
    accelerate: "cubic-bezier(0.4, 0, 1, 1)",
    linear: "linear",
  },
} as const;

export type Motion = typeof motion;
