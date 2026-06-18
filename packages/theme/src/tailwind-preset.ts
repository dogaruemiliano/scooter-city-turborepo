import { breakpoints } from "./tokens/breakpoints";

/**
 * Tailwind v4 users should `@import "@repo/theme/css"` in their stylesheet —
 * the generated CSS uses `@theme` to register all utilities. This preset only
 * exists for tooling that still consumes a JS config (Tailwind v3, IDE plugins).
 */
export const themePreset = {
  theme: {
    screens: Object.fromEntries(
      Object.entries(breakpoints).map(([k, v]) => [k, `${v}px`]),
    ),
  },
} as const;

export default themePreset;
