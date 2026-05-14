export * from "./tokens/index.js";

import { semanticColors } from "./tokens/semantic.js";
import { spacing } from "./tokens/spacing.js";
import { radius } from "./tokens/radius.js";
import { typography } from "./tokens/typography.js";
import { shadow } from "./tokens/shadow.js";
import { motion } from "./tokens/motion.js";
import { zIndex } from "./tokens/z-index.js";
import { breakpoints } from "./tokens/breakpoints.js";

export type ColorScheme = "light" | "dark";

/**
 * Combined token set. Use `tokens.color[scheme]` to get the active color palette.
 * Non-color tokens are mode-independent.
 */
export const tokens = {
  color: semanticColors,
  spacing,
  radius,
  typography,
  shadow,
  motion,
  zIndex,
  breakpoints,
} as const;

export type Tokens = typeof tokens;
