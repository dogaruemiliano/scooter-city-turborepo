import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useColorScheme } from "react-native";
import { tokens } from "@repo/theme/native";
import type { ColorScheme, Tokens } from "@repo/theme/native";

export type ThemePreference = ColorScheme | "system";

export type ThemeContextValue = {
  /** Resolved scheme actually in use (system preference resolved if preference === "system"). */
  scheme: ColorScheme;
  /** What the user picked. "system" means follow OS. */
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  /** Color palette for the current scheme. */
  colors: Tokens["color"][ColorScheme];
  /** Mode-independent tokens. */
  tokens: Tokens;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  children: ReactNode;
  /** Initial preference; defaults to "system". */
  defaultPreference?: ThemePreference;
  /** Optional persistence hook (e.g. AsyncStorage). Called whenever preference changes. */
  onPreferenceChange?: (pref: ThemePreference) => void;
};

export function ThemeProvider({
  children,
  defaultPreference = "system",
  onPreferenceChange,
}: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] =
    useState<ThemePreference>(defaultPreference);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      onPreferenceChange?.(next);
    },
    [onPreferenceChange],
  );

  useEffect(() => {
    setPreferenceState(defaultPreference);
  }, [defaultPreference]);

  const scheme: ColorScheme =
    preference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      preference,
      setPreference,
      colors: tokens.color[scheme],
      tokens,
    }),
    [scheme, preference, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
