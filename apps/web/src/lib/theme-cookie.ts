export type ThemePreference = "light" | "dark" | "system";

export const THEME_COOKIE_NAME = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** What the toggle UI displays; defaults to "system" when no cookie is set. */
export function resolveThemePreference(
  value: string | undefined | null,
): ThemePreference {
  return value === "dark" || value === "light" ? value : "system";
}

/** What goes on <html data-theme={...}>; "system" omits the attribute. */
export function resolveDataTheme(
  value: string | undefined | null,
): "light" | "dark" | undefined {
  return value === "dark" || value === "light" ? value : undefined;
}

/** Client-side: persist preference + sync the DOM so CSS overrides apply immediately. */
export function applyThemePreference(pref: ThemePreference): void {
  if (pref === "system") {
    delete document.documentElement.dataset.theme;
    document.cookie = `${THEME_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
  } else {
    document.documentElement.dataset.theme = pref;
    document.cookie = `${THEME_COOKIE_NAME}=${pref}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }
}
