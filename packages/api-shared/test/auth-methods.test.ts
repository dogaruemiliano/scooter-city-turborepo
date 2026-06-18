import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

test("AUTH_METHOD_IDS contains the canonical method IDs", () => {
  assert.deepEqual(v1.auth.AUTH_METHOD_IDS, ["emailOtp", "google", "apple"]);
});

test("authMethodIdSchema accepts every registered method", () => {
  for (const method of v1.auth.AUTH_METHOD_IDS) {
    assert.equal(v1.auth.authMethodIdSchema.parse(method), method);
  }
});

test("authMethodIdSchema rejects unknown methods", () => {
  assert.equal(v1.auth.authMethodIdSchema.safeParse("github").success, false);
});

test("enabledAuthMethodsSchema accepts canonical method lists", () => {
  assert.deepEqual(
    v1.auth.enabledAuthMethodsSchema.parse({
      methods: ["emailOtp", "google", "apple"],
    }),
    { methods: ["emailOtp", "google", "apple"] },
  );
  assert.deepEqual(
    v1.auth.enabledAuthMethodsSchema.parse({ methods: ["emailOtp"] }),
    { methods: ["emailOtp"] },
  );
  assert.deepEqual(v1.auth.enabledAuthMethodsSchema.parse({ methods: [] }), {
    methods: [],
  });
});

test("enabledAuthMethodsSchema rejects the old boolean response", () => {
  assert.equal(
    v1.auth.enabledAuthMethodsSchema.safeParse({
      emailOtp: true,
      google: true,
      apple: false,
    }).success,
    false,
  );
});

test("enabledAuthMethodsSchema rejects unknown method IDs", () => {
  assert.equal(
    v1.auth.enabledAuthMethodsSchema.safeParse({
      methods: ["emailOtp", "github"],
    }).success,
    false,
  );
});

test("OAUTH_PROVIDERS contains only registered auth methods", () => {
  for (const provider of v1.auth.OAUTH_PROVIDERS) {
    assert.equal(v1.auth.authMethodIdSchema.parse(provider), provider);
  }
});

test("updateProfileInputSchema trims names and accepts null clearing", () => {
  assert.deepEqual(
    v1.auth.updateProfileInputSchema.parse({
      firstName: "  Ada ",
      lastName: null,
    }),
    {
      firstName: "Ada",
      lastName: null,
    },
  );
});

test("updateProfileInputSchema rejects blank names and unknown fields", () => {
  assert.equal(
    v1.auth.updateProfileInputSchema.safeParse({ firstName: "   " }).success,
    false,
  );
  assert.equal(
    v1.auth.updateProfileInputSchema.safeParse({ displayName: "Ada" }).success,
    false,
  );
});
