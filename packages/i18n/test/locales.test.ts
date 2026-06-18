import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultRouteLocale,
  fallbackLocale,
  isSupportedLocale,
  localeHeaderName,
  matchLocale,
  normalizeLocaleTag,
  parseAcceptLanguage,
  resolveLocaleFromHeaders,
} from "../src";

test("normalizeLocaleTag accepts supported primary and regional tags", () => {
  assert.equal(normalizeLocaleTag("ro"), "ro");
  assert.equal(normalizeLocaleTag("RO"), "ro");
  assert.equal(normalizeLocaleTag("ro-RO"), "ro");
  assert.equal(normalizeLocaleTag("en_US"), "en");
  assert.equal(normalizeLocaleTag(" en-GB "), "en");
});

test("normalizeLocaleTag rejects unsupported and empty values", () => {
  assert.equal(normalizeLocaleTag("fr-FR"), null);
  assert.equal(normalizeLocaleTag(""), null);
  assert.equal(normalizeLocaleTag(undefined), null);
});

test("isSupportedLocale narrows only canonical locale IDs", () => {
  assert.equal(isSupportedLocale("ro"), true);
  assert.equal(isSupportedLocale("en"), true);
  assert.equal(isSupportedLocale("en-US"), false);
  assert.equal(isSupportedLocale("fr"), false);
});

test("matchLocale returns the first supported ordered preference", () => {
  assert.equal(matchLocale(["fr-FR", "en-US", "ro-RO"]), "en");
  assert.equal(matchLocale(["fr-FR", "de-DE"], { fallback: "ro" }), "ro");
  assert.equal(matchLocale(["fr-FR", null], { fallback: null }), null);
});

test("parseAcceptLanguage sorts by q value and preserves tie order", () => {
  assert.deepEqual(
    parseAcceptLanguage("fr-FR, en-US;q=0.8, ro-RO;q=0.9, de-DE;q=0"),
    ["fr-FR", "ro-RO", "en-US"],
  );
});

test("resolveLocaleFromHeaders prefers X-Locale over Accept-Language", () => {
  assert.equal(
    resolveLocaleFromHeaders({
      "accept-language": "en-US,en;q=0.8",
      [localeHeaderName]: "ro-RO",
    }),
    "ro",
  );
});

test("resolveLocaleFromHeaders uses Accept-Language before fallback", () => {
  assert.equal(
    resolveLocaleFromHeaders({
      "accept-language": "fr-FR, en-US;q=0.8, ro-RO;q=0.6",
    }),
    "en",
  );
});

test("resolveLocaleFromHeaders supports Headers instances and default fallback", () => {
  const headers = new Headers();
  headers.set("accept-language", "fr-FR");

  assert.equal(resolveLocaleFromHeaders(headers), defaultRouteLocale);
});

test("resolveLocaleFromHeaders can use the message fallback locale explicitly", () => {
  assert.equal(resolveLocaleFromHeaders(null, { fallback: fallbackLocale }), "en");
});
