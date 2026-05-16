import { primitives as p } from "./primitives.js";

/**
 * Semantic color tokens. Components reference these names, never the primitives.
 * Light and dark must mirror the same keys so the generator can emit overrides.
 */
const light = {
  surface: {
    page: p.neutral[0],
    raised: p.neutral[50],
    sunken: p.neutral[100],
    overlay: p.neutral[0],
    scrim: "#00000066",
    action: p.blue[600],
    actionHover: p.blue[700],
    actionActive: p.blue[800],
    actionSubtle: p.blue[50],
    danger: p.red[600],
    dangerSubtle: p.red[50],
    success: p.green[600],
    successSubtle: p.green[50],
    warning: p.amber[500],
    warningSubtle: p.amber[50],
  },
  text: {
    primary: p.neutral[950],
    secondary: p.neutral[700],
    tertiary: p.neutral[500],
    disabled: p.neutral[400],
    danger: p.red[600],
    warning: p.amber[800],
    onAction: p.neutral[0],
    onDanger: p.neutral[0],
    onSuccess: p.neutral[0],
    onWarning: p.neutral[950],
    link: p.blue[600],
    linkHover: p.blue[700],
  },
  border: {
    subtle: p.neutral[200],
    default: p.neutral[300],
    strong: p.neutral[400],
    action: p.blue[600],
    danger: p.red[600],
    focus: p.blue[500],
  },
} as const;

const dark = {
  surface: {
    page: p.neutral[950],
    raised: p.neutral[900],
    sunken: p.neutral[1000],
    overlay: p.neutral[800],
    scrim: "#000000A6",
    action: p.blue[500],
    actionHover: p.blue[400],
    actionActive: p.blue[300],
    actionSubtle: p.blue[950],
    danger: p.red[500],
    dangerSubtle: p.red[950],
    success: p.green[500],
    successSubtle: p.green[950],
    warning: p.amber[400],
    warningSubtle: p.amber[950],
  },
  text: {
    primary: p.neutral[50],
    secondary: p.neutral[300],
    tertiary: p.neutral[400],
    disabled: p.neutral[600],
    danger: p.red[400],
    warning: p.amber[300],
    onAction: p.neutral[950],
    onDanger: p.neutral[950],
    onSuccess: p.neutral[950],
    onWarning: p.neutral[950],
    link: p.blue[400],
    linkHover: p.blue[300],
  },
  border: {
    subtle: p.neutral[800],
    default: p.neutral[700],
    strong: p.neutral[600],
    action: p.blue[500],
    danger: p.red[500],
    focus: p.blue[400],
  },
} as const;

export const semanticColors = { light, dark } as const;

export type SemanticColors = typeof light;
