export * from "./tokens/index";

import { semanticColors } from "./tokens/semantic";
import { primitives } from "./tokens/primitives";
import { spacing } from "./tokens/spacing";
import { radius } from "./tokens/radius";
import { typography } from "./tokens/typography";
import { shadow } from "./tokens/shadow";
import { motion } from "./tokens/motion";
import { magnification } from "./tokens/magnification";
import { aspectRatio } from "./tokens/aspect-ratio";
import { zIndex } from "./tokens/z-index";
import { breakpoints } from "./tokens/breakpoints";

export type ColorScheme = "light" | "dark" | "minimal";

/**
 * Combined token set. Use `tokens.color[scheme]` to get the active color palette.
 * Non-color tokens are mode-independent.
 */
export const tokens = {
  primitives,
  color: semanticColors,
  spacing,
  radius,
  typography,
  shadow,
  motion,
  magnification,
  aspectRatio,
  zIndex,
  breakpoints,
} as const;

export type Tokens = typeof tokens;
