import { useEffect } from "react";
import type { ReactNode } from "react";
import { UnistylesRuntime } from "react-native-unistyles";
import type { ThemePreference } from "./useTheme";

export type { ThemeContextValue, ThemePreference } from "./useTheme";

export type ThemeProviderProps = {
  children: ReactNode;
  /** Initial preference; defaults to "system". */
  defaultPreference?: ThemePreference;
  /** Optional persistence hook. Called whenever preference changes. */
  onPreferenceChange?: (pref: ThemePreference) => void;
};

/**
 * Pass-through provider kept for API compatibility. Unistyles drives theme
 * resolution globally via `StyleSheet.configure({ adaptiveThemes: true })` in
 * `@repo/theme-native/configure`, so no React context is needed.
 *
 * The `defaultPreference` prop, if not "system", flips unistyles into manual
 * mode on mount. Runtime changes go through `useTheme().setPreference(...)`.
 */
export const ThemeProvider = ({
  children,
  defaultPreference = "system",
  onPreferenceChange,
}: ThemeProviderProps) => {
  useEffect(() => {
    if (defaultPreference === "system") {
      UnistylesRuntime.setAdaptiveThemes(true);
    } else {
      UnistylesRuntime.setAdaptiveThemes(false);
      UnistylesRuntime.setTheme(defaultPreference);
    }
    onPreferenceChange?.(defaultPreference);
  }, [defaultPreference, onPreferenceChange]);

  return <>{children}</>;
};
