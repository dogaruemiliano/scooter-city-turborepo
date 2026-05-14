import { useContext } from "react";
import { ThemeContext } from "./ThemeProvider.js";
import type { ThemeContextValue } from "./ThemeProvider.js";

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
