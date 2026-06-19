import assert from "node:assert/strict";
import test from "node:test";

import { messages } from "../src";

test("locale catalogs expose the same message keys", () => {
  assert.deepEqual(leafKeys(messages.ro), leafKeys(messages.en));
});

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") {
    return [prefix];
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    )
    .sort();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
