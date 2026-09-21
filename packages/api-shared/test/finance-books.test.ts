import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

test("finance book management requires a nonblank Romanian name", () => {
  for (const names of [
    { en: "Company" },
    { ro: "   ", en: "Company" },
    { ro: "" },
  ]) {
    assert.equal(
      v1.finance.createFinanceBookInputSchema.safeParse({
        type: "COMPANY",
        names,
      }).success,
      false,
    );
    assert.equal(
      v1.finance.updateFinanceBookInputSchema.safeParse({ names }).success,
      false,
    );
  }
  assert.deepEqual(
    v1.finance.createFinanceBookInputSchema.parse({
      type: "COMPANY",
      names: { ro: "  Firmă  ", en: " Company " },
    }),
    {
      type: "COMPANY",
      names: { ro: "Firmă", en: "Company" },
    },
  );
});

test("book names use the requested translation and always fall back to Romanian", () => {
  const book = { names: { ro: "Registrul firmei", en: "Company book" } };
  assert.equal(v1.finance.financeBookName(book, "en-GB"), "Company book");
  assert.equal(v1.finance.financeBookName(book, "ro"), "Registrul firmei");
  assert.equal(v1.finance.financeBookName(book, "fr"), "Registrul firmei");
  assert.equal(
    v1.finance.financeBookName({ names: { ro: "Firmă" } }, "en"),
    "Firmă",
  );
  assert.equal(
    v1.finance.financeBookName({ names: { ro: "Firmă", en: "  " } }, "en"),
    "Firmă",
  );
});

test("renaming cannot change book type or currency", () => {
  for (const extra of [
    { type: "ASSOCIATE_POOL" },
    { functionalCurrency: "EUR" },
  ]) {
    assert.equal(
      v1.finance.updateFinanceBookInputSchema.safeParse({
        names: { ro: "Firmă" },
        ...extra,
      }).success,
      false,
    );
  }
});
