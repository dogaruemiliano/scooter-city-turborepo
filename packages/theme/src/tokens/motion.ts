/**
 * Motion tokens. Durations in ms; easings as cubic-bezier (web) — RN consumers can use the same
 * curve via Reanimated's Easing.bezier(...).
 */
export const motion = {
  gesture: {
    wizard: {
      axisLockDistance: 8,
      commitFraction: 0.25,
      // Navigation underlays travel half as far as the foreground screen.
      underlayTravelRatio: 0.5,
    },
    sortableTrailingZone: 0.3,
    // Horizontal board edge hover speed in pixels per second.
    horizontalEdgeScrollSpeed: 320,
  },
  duration: {
    instant: 0,
    toastDismiss: 5000,
    removalWindup: 80,
    fast: 150,
    normal: 250,
    slow: 400,
    slower: 600,
    doubleTap: 300,
    countdownTick: 1000,
    documentReviewPause: 3000,
    documentNameScroll: 8000,
    orientationHint: 2400,
    clipboardFeedback: 3000,
  },
  easing: {
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    decelerate: "cubic-bezier(0, 0, 0.2, 1)",
    accelerate: "cubic-bezier(0.4, 0, 1, 1)",
    linear: "linear",
  },
} as const;

export type Motion = typeof motion;
