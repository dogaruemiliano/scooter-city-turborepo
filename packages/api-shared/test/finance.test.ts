import assert from "node:assert/strict";
import test from "node:test";

import { finance } from "../src/v1";

function validTransactionInput() {
  return {
    type: "INCOME",
    amount: "125.50",
    currency: "ron",
    financialScope: "COMPANY",
    paymentMethod: "CASH",
    billingStatus: "BILLED",
    idempotencyKey: "rental-payment-123",
    postImmediately: true,
    balanceChanges: [
      {
        walletId: "wallet-1",
        bucket: "BUSINESS_FUNDS",
        currency: "ron",
        amountDelta: "125.50",
      },
    ],
    references: [
      {
        referenceType: "rental",
        referenceId: "rental-123",
        isPrimary: true,
      },
    ],
  } as const;
}

test("finance transaction input normalizes currency and reference type", () => {
  const parsed = finance.createMoneyTransactionInputSchema.parse(
    validTransactionInput(),
  );

  assert.equal(parsed.currency, "RON");
  assert.equal(parsed.balanceChanges[0]?.currency, "RON");
  assert.equal(parsed.references[0]?.referenceType, "RENTAL");
});

test("finance transaction input rejects duplicate wallet bucket changes", () => {
  const input = validTransactionInput();
  const result = finance.createMoneyTransactionInputSchema.safeParse({
    ...input,
    balanceChanges: [...input.balanceChanges, ...input.balanceChanges],
  });

  assert.equal(result.success, false);
});

test("finance transaction input allows at most one primary reference", () => {
  const input = validTransactionInput();
  const result = finance.createMoneyTransactionInputSchema.safeParse({
    ...input,
    references: [
      ...input.references,
      {
        referenceType: "PURCHASE",
        referenceId: "purchase-1",
        isPrimary: true,
      },
    ],
  });

  assert.equal(result.success, false);
});

test("finance money inputs reject zero and excessive precision", () => {
  assert.equal(
    finance.positiveMoneyAmountSchema.safeParse("0.00").success,
    false,
  );
  assert.equal(
    finance.positiveMoneyAmountSchema.safeParse("10.001").success,
    false,
  );
  assert.equal(
    finance.signedNonZeroMoneyAmountSchema.safeParse("-10.25").success,
    true,
  );
});

test("wallet list query coerces pagination and active filters", () => {
  assert.deepEqual(
    finance.listWalletsQuerySchema.parse({
      page: "2",
      pageSize: "10",
      type: "USER",
      isActive: "false",
      search: "  owner@example.com  ",
    }),
    {
      page: 2,
      pageSize: 10,
      type: "USER",
      isActive: false,
      search: "owner@example.com",
    },
  );
});

test("finance summary query requires an ordered date range", () => {
  assert.equal(
    finance.financeSummaryQuerySchema.safeParse({
      from: "2026-07-29T12:00:00.000Z",
      to: "2026-07-29T11:00:00.000Z",
    }).success,
    false,
  );
  assert.equal(
    finance.financeSummaryQuerySchema.safeParse({
      from: "2026-07-29T00:00:00.000Z",
      to: "2026-07-29T23:59:59.999Z",
    }).success,
    true,
  );
});

test("finance routes expose stable versioned endpoint paths", () => {
  assert.equal(finance.ROUTES.summary, "/v1/finance/summary");
  assert.equal(finance.ROUTES.wallets.mine, "/v1/finance/me/wallet");
  assert.equal(
    finance.ROUTES.transactions.reverse("transaction-1"),
    "/v1/finance/transactions/transaction-1/reverse",
  );
  assert.equal(
    finance.ROUTES.claims.outstanding,
    "/v1/finance/claims/outstanding",
  );
});
