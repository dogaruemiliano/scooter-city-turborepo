/**
 * Z-index layers. Use named tiers instead of arbitrary numbers in components.
 */
export const zIndex = {
  base: 0,
  raised: 10,
  dropdown: 1000,
  sticky: 1100,
  navigation: 1150,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600,
} as const;

export type ZIndex = typeof zIndex;
