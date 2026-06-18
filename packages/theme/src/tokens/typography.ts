/**
 * Typography tokens. Font families differ per platform; sizes/line-heights/weights are shared.
 */
export const typography = {
  fontFamily: {
    sans: {
      web: "var(--font-manrope, 'Manrope Variable'), ui-sans-serif, system-ui, sans-serif",
      native: "Manrope_400Regular",
    },
    mono: {
      web: "var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace",
      native: "Menlo",
    },
  },
  fontFamilyByWeight: {
    regular: "Manrope_400Regular",
    medium: "Manrope_500Medium",
    semibold: "Manrope_600SemiBold",
    bold: "Manrope_700Bold",
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
