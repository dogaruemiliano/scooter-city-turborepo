import type {} from "./unistyles";
import { tokens } from "@repo/theme/native";

const sharedTokens = {
  spacing: tokens.spacing,
  radius: tokens.radius,
  typography: tokens.typography,
  motion: tokens.motion,
  zIndex: tokens.zIndex,
  shadow: {
    none: tokens.shadow.none,
    sm: tokens.shadow.sm,
    md: tokens.shadow.md,
    lg: tokens.shadow.lg,
    xl: tokens.shadow.xl,
  },
} as const;

const lightTheme = {
  ...sharedTokens,
  colors: tokens.color.light,
} as const;

const darkTheme = {
  ...sharedTokens,
  colors: tokens.color.dark,
} as const;

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

// Unistyles requires the smallest breakpoint to be 0; prepend `xs` as the
// implicit mobile-first base. Tailwind handles the same case implicitly, so
// it isn't part of the shared token map.
export const breakpoints = {
  xs: 0,
  ...tokens.breakpoints,
} as const;

export type AppThemes = typeof themes;
export type AppBreakpoints = typeof breakpoints;
export type Theme = AppThemes[keyof AppThemes];
