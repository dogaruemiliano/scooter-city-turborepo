import { describe, expect, it } from "vitest";

import {
  getLocalizedSignInPath,
  getLocalePathInfo,
  getUnprefixedPathname,
  isPublicPathname,
  localizePath,
  safeNextPath,
} from "./paths";

describe("i18n path helpers", () => {
  it("keeps next paths local while preserving locale prefixes", () => {
    expect(safeNextPath("/en/account/settings?tab=sessions#active")).toBe(
      "/en/account/settings?tab=sessions#active",
    );
    expect(safeNextPath("/account/settings")).toBe("/account/settings");
    expect(safeNextPath("https://example.com/account")).toBe("/");
    expect(safeNextPath("//example.com/account")).toBe("/");
    expect(safeNextPath("account/settings", "/en")).toBe("/en");
  });

  it("normalizes locale-prefixed pathnames to shared route pathnames", () => {
    expect(getLocalePathInfo("/sign-in")).toEqual({
      locale: "ro",
      pathname: "/sign-in",
      unprefixedPathname: "/sign-in",
    });
    expect(getLocalePathInfo("/en/sign-in")).toEqual({
      locale: "en",
      pathname: "/en/sign-in",
      unprefixedPathname: "/sign-in",
    });
    expect(getUnprefixedPathname("/ro/account/settings")).toBe(
      "/account/settings",
    );
  });

  it("builds localized paths without localizing static route segments", () => {
    expect(localizePath("/sign-in", "ro")).toBe("/sign-in");
    expect(localizePath("/sign-in", "en")).toBe("/en/sign-in");
    expect(localizePath("/en/account/settings?tab=sessions", "ro")).toBe(
      "/account/settings?tab=sessions",
    );
    expect(localizePath("/account/settings?tab=sessions", "en")).toBe(
      "/en/account/settings?tab=sessions",
    );
  });

  it("builds localized sign-in URLs with safe next parameters", () => {
    expect(getLocalizedSignInPath("ro")).toBe("/sign-in");
    expect(getLocalizedSignInPath("en")).toBe("/en/sign-in");
    expect(getLocalizedSignInPath("en", "/en/account/settings")).toBe(
      "/en/sign-in?next=%2Fen%2Faccount%2Fsettings",
    );
    expect(getLocalizedSignInPath("ro", "//example.com/account")).toBe(
      "/sign-in?next=%2F",
    );
  });

  it("detects public sign-in paths across locale prefixes", () => {
    expect(isPublicPathname("/sign-in")).toBe(true);
    expect(isPublicPathname("/en/sign-in")).toBe(true);
    expect(isPublicPathname("/ro/sign-in")).toBe(true);
    expect(isPublicPathname("/sign-in-extra")).toBe(false);
    expect(isPublicPathname("/en/account/settings")).toBe(false);
  });
});
