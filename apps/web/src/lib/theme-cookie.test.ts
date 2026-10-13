import { beforeEach, describe, expect, it } from "vitest";

import {
  applyThemePreference,
  isThemePreference,
  resolveDataTheme,
  resolveThemePreference,
} from "./theme-cookie";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = "theme=; path=/; max-age=0";
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
});
