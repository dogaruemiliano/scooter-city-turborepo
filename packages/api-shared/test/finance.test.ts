import assert from "node:assert/strict";
import test from "node:test";

import { v1 } from "../src";

test("every ledger role maps to exactly one accounting category", () => {
  const mapped = Object.keys(v1.finance.LEDGER_ROLE_CATEGORY).sort();

  assert.deepEqual(mapped, [...v1.finance.LEDGER_ACCOUNT_ROLES].sort());
  assert.equal(
    v1.finance.LEDGER_ROLE_CATEGORY.PAYABLE_TO_ASSOCIATE,
    "LIABILITY",
  );
  // A receivable is money owed TO the book, so it is an asset — not the
  // mirror image of a payable's category.
  assert.equal(
    v1.finance.LEDGER_ROLE_CATEGORY.RECEIVABLE_FROM_ASSOCIATE,
    "ASSET",
  );
  assert.equal(v1.finance.LEDGER_ROLE_CATEGORY.FIXED_ASSET, "ASSET");
});

test("each expense treatment debits its own ledger role", () => {
  assert.deepEqual(v1.finance.EXPENSE_TREATMENT_DEBIT_ROLE, {
    OPERATING_EXPENSE: "OPERATING_EXPENSE",
    NON_OPERATIONAL_COMPANY_EXPENSE: "NON_OPERATIONAL_COMPANY_EXPENSE",
    CAPITAL_ASSET: "FIXED_ASSET",
    ASSOCIATE_POOL_EXPENSE: "ASSOCIATE_POOL_EXPENSE",
  });
});

test("expense treatments stay within their finance book", () => {
  assert.deepEqual(v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE.COMPANY, [
    "OPERATING_EXPENSE",
    "NON_OPERATIONAL_COMPANY_EXPENSE",
    "CAPITAL_ASSET",
  ]);
  assert.deepEqual(v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE.ASSOCIATE_POOL, [
    "ASSOCIATE_POOL_EXPENSE",
  ]);
});

test("capital assets stay out of company-benefit settlement", () => {
  assert.deepEqual(v1.finance.SETTLED_EXPENSE_TREATMENTS, [
    "OPERATING_EXPENSE",
    "NON_OPERATIONAL_COMPANY_EXPENSE",
  ]);
});

test("parses major-unit amounts without floating-point drift", () => {
  assert.equal(v1.finance.parseMajorToMinor("300"), 30_000);
  assert.equal(v1.finance.parseMajorToMinor("300.5"), 30_050);
  assert.equal(v1.finance.parseMajorToMinor("300,05"), 30_005);
  assert.equal(v1.finance.parseMajorToMinor(" 1 234.99 "), 123_499);
  assert.equal(v1.finance.parseMajorToMinor("-12.50"), -1_250);
  // parseFloat("19.99") * 100 is 1998.9999999999998.
  assert.equal(v1.finance.parseMajorToMinor("19.99"), 1_999);
});

test("rejects amounts it would otherwise have to round", () => {
  assert.throws(
    () => v1.finance.parseMajorToMinor("10.005"),
    v1.finance.InvalidMoneyAmountError,
  );
  assert.throws(
    () => v1.finance.parseMajorToMinor("abc"),
    v1.finance.InvalidMoneyAmountError,
  );
  assert.equal(v1.finance.isValidMajorAmount("10.005"), false);
  assert.equal(v1.finance.isValidMajorAmount("10.05"), true);
});

test("formats minor units back to a canonical major-unit string", () => {
  assert.equal(v1.finance.formatMinorToMajor(30_000), "300.00");
  assert.equal(v1.finance.formatMinorToMajor(30_005), "300.05");
  assert.equal(v1.finance.formatMinorToMajor(-1_250), "-12.50");
  assert.equal(v1.finance.formatMinorToMajor(0), "0.00");
  assert.equal(v1.finance.formatMinorToMajor(-5), "-0.05");
});

test("expense payment input is a discriminated union on the source type", () => {
  const bookAccount = v1.finance.expensePaymentInputSchema.safeParse({
    sourceType: "BOOK_ACCOUNT",
    sourceAccountId: "acc_1",
    paymentMethod: "CARD",
    amountMinor: 30_000,
  });
  assert.equal(bookAccount.success, true);

  // A book-account payment has no payer: the book paid itself.
  const withPayer = v1.finance.expensePaymentInputSchema.safeParse({
    sourceType: "BOOK_ACCOUNT",
    sourceAccountId: "acc_1",
    payerAssociateId: "user_1",
    paymentMethod: "CARD",
    amountMinor: 30_000,
  });
  assert.equal(withPayer.success, false);

  const missingPayer = v1.finance.expensePaymentInputSchema.safeParse({
    sourceType: "ASSOCIATE_PERSONAL_FUNDS",
    paymentMethod: "CASH",
    amountMinor: 30_000,
  });
  assert.equal(missingPayer.success, false);
});

test("a common allocation cannot name a beneficiary", () => {
  assert.equal(
    v1.finance.economicAllocationInputSchema.safeParse({
      type: "COMMON",
      associateId: "user_1",
      amountMinor: 100,
    }).success,
    false,
  );

  assert.equal(
    v1.finance.economicAllocationInputSchema.safeParse({
      type: "ASSOCIATE_SPECIFIC",
      amountMinor: 100,
    }).success,
    false,
  );
});

const validExpense = {
  bookId: "book_1",
  occurredAt: "2026-08-14T10:00:00.000Z",
  amountMinor: 100_000,
  treatment: "OPERATING_EXPENSE",
  categoryId: "cat_1",
  payments: [
    {
      sourceType: "BOOK_ACCOUNT",
      sourceAccountId: "acc_bank",
      paymentMethod: "BANK_TRANSFER",
      amountMinor: 100_000,
    },
  ],
  allocations: [{ type: "COMMON", amountMinor: 100_000 }],
};

test("accepts a mixed-payment, mixed-allocation expense", () => {
  const result = v1.finance.createExpenseInputSchema.safeParse({
    ...validExpense,
    payments: [
      {
        sourceType: "BOOK_ACCOUNT",
        sourceAccountId: "acc_bank",
        paymentMethod: "BANK_TRANSFER",
        amountMinor: 50_000,
      },
      {
        sourceType: "ASSOCIATE_PERSONAL_FUNDS",
        payerAssociateId: "user_emiliano",
        paymentMethod: "CARD",
        amountMinor: 30_000,
      },
      {
        sourceType: "ASSOCIATE_PERSONAL_FUNDS",
        payerAssociateId: "user_iusti",
        paymentMethod: "CASH",
        amountMinor: 20_000,
      },
    ],
    allocations: [
      { type: "COMMON", amountMinor: 70_000 },
      {
        type: "ASSOCIATE_SPECIFIC",
        associateId: "user_emiliano",
        amountMinor: 30_000,
      },
    ],
  });

  assert.equal(result.success, true);
});

test("payments and allocations must each total the expense amount", () => {
  const shortPayments = v1.finance.createExpenseInputSchema.safeParse({
    ...validExpense,
    payments: [{ ...validExpense.payments[0], amountMinor: 90_000 }],
  });

  assert.equal(shortPayments.success, false);
  assert.equal(
    shortPayments.error?.issues[0]?.message,
    v1.finance.PAYMENTS_TOTAL_MESSAGE,
  );

  const shortAllocations = v1.finance.createExpenseInputSchema.safeParse({
    ...validExpense,
    allocations: [{ type: "COMMON", amountMinor: 90_000 }],
  });

  assert.equal(shortAllocations.success, false);
  assert.equal(
    shortAllocations.error?.issues[0]?.message,
    v1.finance.ALLOCATIONS_TOTAL_MESSAGE,
  );
});

test("an associate may only hold one allocation line", () => {
  const result = v1.finance.createExpenseInputSchema.safeParse({
    ...validExpense,
    allocations: [
      {
        type: "ASSOCIATE_SPECIFIC",
        associateId: "user_iusti",
        amountMinor: 60_000,
      },
      {
        type: "ASSOCIATE_SPECIFIC",
        associateId: "user_iusti",
        amountMinor: 40_000,
      },
    ],
  });

  assert.equal(result.success, false);
  assert.equal(
    result.error?.issues[0]?.message,
    v1.finance.DUPLICATE_ALLOCATION_MESSAGE,
  );
});

test("money amounts must be positive integers", () => {
  for (const amountMinor of [0, -100, 10.5]) {
    assert.equal(
      v1.finance.createExpenseInputSchema.safeParse({
        ...validExpense,
        amountMinor,
        payments: [{ ...validExpense.payments[0], amountMinor }],
        allocations: [{ type: "COMMON", amountMinor }],
      }).success,
      false,
      `expected ${amountMinor} to be rejected`,
    );
  }
});

test("settlement preview requires a forward-running period", () => {
  assert.equal(
    v1.finance.previewSettlementInputSchema.safeParse({
      bookId: "book_1",
      kind: "COMPANY_SPECIFIC_BENEFIT",
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-07-01T00:00:00.000Z",
    }).success,
    false,
  );
});

test("route helpers build the versioned finance paths", () => {
  assert.equal(
    v1.finance.ROUTES.expenses.preview,
    "/v1/finance/expenses/preview",
  );
  assert.equal(
    v1.finance.ROUTES.operations.reverse("op_1"),
    "/v1/finance/operations/op_1/reverse",
  );
  assert.equal(
    v1.finance.ROUTES.accounts.balance("acc_1"),
    "/v1/finance/accounts/acc_1/balance",
  );
});
