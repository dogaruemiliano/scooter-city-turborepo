import { useCallback } from "react";
import { useColorScheme } from "react-native";
import { useUnistyles, UnistylesRuntime } from "react-native-unistyles";
import { tokens } from "@repo/theme/native";
import type { ColorScheme, Tokens } from "@repo/theme/native";

export type ThemePreference = ColorScheme | "system";

export type ThemeContextValue = {
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  colors: Tokens["color"][ColorScheme];
  tokens: Tokens;
};

export function useTheme(): ThemeContextValue {
  const systemScheme = useColorScheme();
  const { rt } = useUnistyles();

  const scheme: ColorScheme = rt.themeName === "dark" ? "dark" : "light";

  const preference: ThemePreference = rt.hasAdaptiveThemes ? "system" : scheme;

  const setPreference = useCallback((next: ThemePreference) => {
    if (next === "system") {
      UnistylesRuntime.setAdaptiveThemes(true);
      return;
    }
    UnistylesRuntime.setAdaptiveThemes(false);
    UnistylesRuntime.setTheme(next);
  }, []);

  void systemScheme;

  return {
    scheme,
    preference,
    setPreference,
    colors: tokens.color[scheme],
    tokens,
  };
}
