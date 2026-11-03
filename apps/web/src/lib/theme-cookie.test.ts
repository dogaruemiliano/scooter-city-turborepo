import { tokens } from "@repo/theme";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyThemePreference,
  isThemePreference,
  resolveDataTheme,
  resolveThemePreference,
  themeColorMetadata,
} from "./theme-cookie";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = "theme=; path=/; max-age=0";
});

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.remove();
  });
});

describe("theme preference", () => {
  it("falls back to system for removed or unknown preferences", () => {
    for (const value of ["minimal", "unknown", undefined, null]) {
      expect(resolveThemePreference(value)).toBe("system");
      expect(resolveDataTheme(value)).toBeUndefined();
      expect(isThemePreference(value)).toBe(false);
    }
  });

  it.each(["light", "dark"] as const)("resolves and persists %s", (theme) => {
    expect(resolveThemePreference(theme)).toBe(theme);
    expect(resolveDataTheme(theme)).toBe(theme);
    applyThemePreference(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(document.cookie).toContain(`theme=${theme}`);
  });

  it("keeps system mode attribute-free and clears a saved preference", () => {
    applyThemePreference("dark");
    applyThemePreference("system");

    expect(resolveThemePreference("system")).toBe("system");
    expect(resolveDataTheme("system")).toBeUndefined();
    expect(isThemePreference("system")).toBe(true);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.cookie).not.toContain("theme=");
  });

  it("provides media-aware browser colors from the shared theme for system mode", () => {
    expect(themeColorMetadata("system")).toEqual([
      {
        media: "(prefers-color-scheme: light)",
        color: tokens.color.light.background,
      },
      {
        media: "(prefers-color-scheme: dark)",
        color: tokens.color.dark.background,
      },
    ]);
  });

  it.each(["light", "dark"] as const)(
    "uses the explicit %s browser color regardless of system appearance",
    (theme) => {
      for (const entry of themeColorMetadata(theme)) {
        expect(entry.color).toBe(tokens.color[theme].background);
      }
    },
  );

  it("updates server-rendered browser colors in place and restores system mode", () => {
    const metaTags = themeColorMetadata("system").map(({ media, color }) => {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.setAttribute("media", media);
      meta.content = color;
      document.head.appendChild(meta);
      return meta;
    });

    for (const preference of ["dark", "light", "system"] as const) {
      applyThemePreference(preference);
      expect([
        ...document.querySelectorAll('meta[name="theme-color"]'),
      ]).toEqual(metaTags);
      for (const [index, expected] of themeColorMetadata(
        preference,
      ).entries()) {
        expect(metaTags[index]).toHaveAttribute("content", expected.color);
        expect(metaTags[index]).toHaveAttribute("media", expected.media);
      }
    }
  });
});
