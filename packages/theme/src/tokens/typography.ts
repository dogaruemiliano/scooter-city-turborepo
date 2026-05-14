/**
 * Typography tokens. Font families differ per platform; sizes/line-heights/weights are shared.
 */
export const typography = {
  fontFamily: {
    sans: {
      web: "var(--font-sans, ui-sans-serif), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      native: "System",
    },
    mono: {
      web: "var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace",
      native: "Menlo",
    },
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
    "5xl": 48,
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
  },
} as const;

export type Typography = typeof typography;
