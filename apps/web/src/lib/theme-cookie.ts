import { tokens } from "@repo/theme";

export const EXPLICIT_THEMES = ["light", "dark"] as const;
export type ExplicitTheme = (typeof EXPLICIT_THEMES)[number];
export type ThemePreference = ExplicitTheme | "system";

export const THEME_COOKIE_NAME = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Keep both media entries stable so theme switches can update them in place. */
export function themeColorMetadata(preference: ThemePreference) {
  return EXPLICIT_THEMES.map((scheme) => ({
    media: `(prefers-color-scheme: ${scheme})`,
    color:
      tokens.color[preference === "system" ? scheme : preference].background,
  }));
}

/** What the toggle UI displays; defaults to "system" when no cookie is set. */
export function resolveThemePreference(
  value: string | undefined | null,
): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

/** What goes on <html data-theme={...}>; "system" omits the attribute. */
export function resolveDataTheme(
  value: string | undefined | null,
): ExplicitTheme | undefined {
  return isExplicitTheme(value) ? value : undefined;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || isExplicitTheme(value);
}

function isExplicitTheme(value: unknown): value is ExplicitTheme {
  return EXPLICIT_THEMES.some((theme) => theme === value);
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

  const metaTags = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  for (const { media, color } of themeColorMetadata(pref)) {
    for (const meta of metaTags) {
      if (meta.getAttribute("media") === media) meta.content = color;
    }
  }
}
