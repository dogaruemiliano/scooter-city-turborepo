import { beforeEach, describe, expect, it } from "vitest";

import {
  applyThemePreference,
  resolveDataTheme,
  resolveThemePreference,
} from "./theme-cookie";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = "theme=; path=/; max-age=0";
});

describe("theme preference", () => {
  it("recognizes the minimal theme on the server", () => {
    expect(resolveThemePreference("minimal")).toBe("minimal");
    expect(resolveDataTheme("minimal")).toBe("minimal");
  });

  it("applies and persists the minimal theme in the browser", () => {
    applyThemePreference("minimal");

    expect(document.documentElement.dataset.theme).toBe("minimal");
    expect(document.cookie).toContain("theme=minimal");
  });

  it("keeps system mode attribute-free", () => {
    applyThemePreference("minimal");
    applyThemePreference("system");

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.cookie).not.toContain("theme=minimal");
  });
});
