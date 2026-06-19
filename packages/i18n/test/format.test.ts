import assert from "node:assert/strict";
import test from "node:test";

import {
  createFormatter,
  formatMessage,
  getMessageTemplate,
  interpolateMessage,
  type CatalogsByLocale,
  type MessageKey,
} from "../src";

test("formatMessage interpolates simple variables", () => {
  assert.equal(
    formatMessage("en", "api.auth.otpSent", { code: "123456", ttl: 5 }),
    "Your code is 123456. It expires in 5 minutes.",
  );
});

test("interpolateMessage preserves unknown placeholders", () => {
  assert.equal(
    interpolateMessage("Code {code} expires in {ttl} minutes.", {
      code: "123456",
    }),
    "Code 123456 expires in {ttl} minutes.",
  );
});

test("formatMessage falls back to fallback locale catalog", () => {
  const catalogs = {
    en: {
      api: {
        auth: {
          otpSent: "Fallback code {code} expires in {ttl} minutes.",
        },
      },
    },
    ro: {
      api: {
        auth: {},
      },
    },
  } satisfies CatalogsByLocale;

  assert.equal(
    formatMessage(
      "ro",
      "api.auth.otpSent",
      { code: "123456", ttl: 5 },
      {
        catalogs,
      },
    ),
    "Fallback code 123456 expires in 5 minutes.",
  );
});

test("formatMessage returns the key when no locale has a template", () => {
  const missingKey = "api.auth.otpInvalid" satisfies MessageKey;

  assert.equal(
    formatMessage("ro", missingKey, undefined, {
      catalogs: {
        en: {},
        ro: {},
      },
    }),
    missingKey,
  );
});

test("createFormatter normalizes locale and reports template availability", () => {
  const formatter = createFormatter("ro-RO");

  assert.equal(formatter.locale, "ro");
  assert.equal(formatter.has("shared.actions.retry"), true);
  assert.equal(
    formatter.format("api.errors.rateLimited", { ttl: 30 }),
    "Prea multe cereri. Încearcă din nou în 30 secunde.",
  );
});

test("getMessageTemplate returns null for missing custom templates", () => {
  assert.equal(
    getMessageTemplate("ro", "auth.errors.csrf", {
      catalogs: {
        en: {},
        ro: {},
      },
    }),
    null,
  );
});
