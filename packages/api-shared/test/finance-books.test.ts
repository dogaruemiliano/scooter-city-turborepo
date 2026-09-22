import assert from "node:assert/strict";
import test from "node:test";
import { v1 } from "../src";

test("associate options deduplicate ownership history by user ID, not name", () => {
  const associate: v1.finance.FinanceAssociate = {
    id: "emiliano",
    email: "emiliano@example.test",
    firstName: "Emiliano",
    lastName: "Dogaru",
    displayName: "Emiliano Dogaru",
  };
  const previous: v1.finance.FinanceBookMember = {
    id: "previous",
    associateId: associate.id,
    associate,
    shareBasisPoints: 10_000,
    validFrom: "2026-09-21T11:13:21.756Z",
    validUntil: "2026-09-21T11:14:51.785Z",
  };
  const current = {
    ...previous,
    id: "current",
    shareBasisPoints: 5_000,
    validFrom: previous.validUntil!,
    validUntil: null,
  };
  const namesake = {
    ...associate,
    id: "different-person",
    email: "namesake@example.test",
  };
  const book = {
    members: [
      previous,
      current,
      {
        ...current,
        id: "namesake",
        associateId: namesake.id,
        associate: namesake,
      },
      { ...previous, id: "missing", associate: null },
    ],
  };
  assert.deepEqual(v1.finance.financeBookAssociates(book), [
    associate,
    namesake,
  ]);
  assert.equal(book.members.length, 4);
  assert.deepEqual(v1.finance.financeBookAssociates({ members: [previous] }), [
    associate,
  ]);
  assert.deepEqual(v1.finance.financeBookAssociates(undefined), []);
});

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
