import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

test("normalized contact schemas trim and canonicalize values", () => {
  assert.equal(
    v1.common.normalizedEmailSchema.parse("  RIDER@EXAMPLE.COM "),
    "rider@example.com",
  );
  assert.equal(
    v1.common.normalizedPhoneSchema.parse(" +40712345678 "),
    "+40712345678",
  );
});

test("countryCodeSchema uppercases ISO alpha-2 codes", () => {
  assert.equal(v1.common.countryCodeSchema.parse(" ro "), "RO");
  assert.equal(v1.common.countryCodeSchema.safeParse("rou").success, false);
});

test("dateOnlySchema accepts real calendar dates only", () => {
  assert.equal(v1.common.dateOnlySchema.parse("1990-02-28"), "1990-02-28");
  assert.equal(v1.common.dateOnlySchema.safeParse("1990-02-31").success, false);
});

test("queryBooleanSchema coerces common query-string booleans", () => {
  assert.equal(v1.common.queryBooleanSchema.parse("true"), true);
  assert.equal(v1.common.queryBooleanSchema.parse("0"), false);
  assert.equal(v1.common.queryBooleanSchema.safeParse("yes").success, false);
});

test("trimmed string helper schemas trim and reject blanks", () => {
  const required = v1.common.requiredTrimmedStringSchema(10);
  const nullable = v1.common.nullableTrimmedStringSchema(10);
  const search = v1.common.optionalSearchStringSchema(10);

  assert.equal(required.parse("  Ada "), "Ada");
  assert.equal(required.safeParse("   ").success, false);
  assert.equal(nullable.parse(null), null);
  assert.equal(search.parse("   "), undefined);
});
