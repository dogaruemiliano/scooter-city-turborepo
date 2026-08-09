import assert from "node:assert/strict";
import test from "node:test";

import { finance } from "../src/v1";

function input(
  source: finance.ExpensePaymentSource,
  target: finance.ExpenseAttributionTarget,
) {
  return {
    legalEntityId: "entity-1",
    payeeId: "payee-1",
    categoryId: "category-1",
    occurredOn: "2026-08-01",
    currency: "ron",
    grossAmount: "119.00",
    idempotencyKey: `${source}:${target}`,
    payment: {
      source,
      companyWalletId: source === "PERSONAL_FUNDS" ? undefined : "wallet-1",
      fundedByUserId: source === "PERSONAL_FUNDS" ? "user-funder" : undefined,
      paidByUserId: "user-payer",
      amount: "119",
      paidOn: "2026-08-01",
    },
    attribution: {
      target,
      businessOwnerId: target === "OWNER" ? "owner-beneficiary" : undefined,
    },
    taxLines: [
      {
        vatRate: "19",
        netAmount: "100",
        vatAmount: "19",
        grossAmount: "119.00",
        deductiblePercent: "100",
      },
    ],
  };
}

test("expense source and beneficiary matrix locks reimbursement treatment", () => {
  const expected = [
    ["COMPANY_CARD", "BUSINESS", true, "NON_REIMBURSABLE"],
    ["COMPANY_CARD", "OWNER", true, "NON_REIMBURSABLE"],
    ["COMPANY_CASH_DESK", "BUSINESS", true, "NON_REIMBURSABLE"],
    ["COMPANY_CASH_DESK", "OWNER", true, "NON_REIMBURSABLE"],
    ["PERSONAL_FUNDS", "BUSINESS", true, "REIMBURSABLE"],
    ["PERSONAL_FUNDS", "OWNER", true, "NON_REIMBURSABLE"],
  ] as const;

  for (const [source, target, valid, treatment] of expected) {
    const result = finance.createExpenseInputSchema.safeParse(
      input(source, target),
    );
    assert.equal(result.success, valid, `${source} + ${target}`);
    assert.equal(finance.expenseFundingTreatmentFor(source, target), treatment);
  }
});

test("payer, personal funder and owner beneficiary remain independent", () => {
  const parsed = finance.createExpenseInputSchema.parse(
    input("PERSONAL_FUNDS", "OWNER"),
  );

  assert.equal(parsed.payment.paidByUserId, "user-payer");
  assert.equal(parsed.payment.fundedByUserId, "user-funder");
  assert.equal(parsed.attribution.businessOwnerId, "owner-beneficiary");
  assert.equal(
    finance.expectedExpenseFundingTreatment(parsed),
    "NON_REIMBURSABLE",
  );
});

test("a draft can be updated to company cash with owner attribution", () => {
  const value = input("COMPANY_CASH_DESK", "OWNER");
  assert.equal(
    finance.updateExpenseInputSchema.safeParse({
      payment: value.payment,
      attribution: value.attribution,
    }).success,
    true,
  );
});

test("personal funding requires a funder and forbids a company wallet", () => {
  const value = input("PERSONAL_FUNDS", "BUSINESS");
  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      payment: {
        ...value.payment,
        fundedByUserId: undefined,
        companyWalletId: "wallet-1",
      },
    }).success,
    false,
  );
});

test("company funding requires a wallet and forbids a personal funder", () => {
  const value = input("COMPANY_CARD", "BUSINESS");
  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      payment: {
        ...value.payment,
        companyWalletId: undefined,
        fundedByUserId: "user-funder",
      },
    }).success,
    false,
  );
});

test("single payment and VAT line amounts reconcile as decimal strings", () => {
  const value = input("COMPANY_CARD", "BUSINESS");

  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      payment: { ...value.payment, amount: "118.99" },
    }).success,
    false,
  );
  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      taxLines: [
        {
          vatRate: "19",
          netAmount: "100.00",
          vatAmount: "18.99",
          grossAmount: "119.00",
          deductiblePercent: "100",
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      taxLines: [
        {
          vatRate: "9",
          netAmount: "50",
          vatAmount: "4.50",
          grossAmount: "54.50",
          deductiblePercent: "50",
        },
      ],
    }).success,
    false,
  );
});

test("document primitives contain manual review metadata and no OCR fields", () => {
  const parsed = finance.expenseDocumentInputSchema.parse({
    type: "INVOICE",
    documentNumber: "INV-1",
    supplierTaxIdentifier: "RO123",
    buyerCuiStatus: "MATCHED",
    reviewStatus: "CONFIRMED",
  });

  assert.equal(parsed.documentNumber, "INV-1");
  assert.equal("ocrStatus" in parsed, false);
  assert.equal("ocrResult" in parsed, false);
});

test("document asset link primitives expose original and normalized roles", () => {
  assert.equal(
    finance.expenseDocumentAssetInputSchema.safeParse({
      assetId: "asset-1",
      role: "ORIGINAL",
    }).success,
    true,
  );
  assert.equal(
    finance.expenseDocumentAssetInputSchema.safeParse({
      assetId: "asset-2",
      role: "OCR_RESULT",
    }).success,
    false,
  );
});

test("payee and category are optional for quick-entry expenses", () => {
  const value = input("PERSONAL_FUNDS", "BUSINESS");
  const { payeeId: _payeeId, categoryId: _categoryId, ...rest } = value;

  assert.equal(finance.createExpenseInputSchema.safeParse(rest).success, true);
  assert.equal(finance.createExpenseInputSchema.safeParse(value).success, true);
});

test("scooter allocation amounts must sum to the expense gross amount", () => {
  const value = input("COMPANY_CARD", "BUSINESS");

  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      scooterAllocations: [
        { scooterId: "scooter-1", amount: "59.50" },
        { scooterId: "scooter-2", amount: "59.50" },
      ],
    }).success,
    true,
  );
  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      scooterAllocations: [
        { scooterId: "scooter-1", amount: "50.00" },
        { scooterId: "scooter-2", amount: "59.50" },
      ],
    }).success,
    false,
  );
});

test("scooter allocations cannot repeat the same scooter", () => {
  const value = input("COMPANY_CARD", "BUSINESS");

  assert.equal(
    finance.createExpenseInputSchema.safeParse({
      ...value,
      scooterAllocations: [
        { scooterId: "scooter-1", amount: "60.00" },
        { scooterId: "scooter-1", amount: "59.00" },
      ],
    }).success,
    false,
  );
});

test("legal entity input creates or links exactly one company", () => {
  const base = { defaultCurrency: "RON", walletIds: [] };
  assert.equal(
    finance.createBusinessLegalEntityInputSchema.safeParse({
      ...base,
      companyId: "company-1",
    }).success,
    true,
  );
  assert.equal(
    finance.createBusinessLegalEntityInputSchema.safeParse(base).success,
    false,
  );
  assert.equal(
    finance.createBusinessLegalEntityInputSchema.safeParse({
      ...base,
      companyId: "company-1",
      company: {
        legalName: "Duplicate source",
        legalForm: "SRL",
        taxIdentifier: "RO123",
      },
    }).success,
    false,
  );
  assert.equal(
    finance.createBusinessLegalEntityInputSchema.safeParse({
      ...base,
      company: { legalName: "Own company", legalForm: "SRL" },
    }).success,
    false,
  );
});

test("legal entity input accepts distinct card accounts with application users", () => {
  const result = finance.createBusinessLegalEntityInputSchema.safeParse({
    companyId: "company-1",
    defaultCurrency: "RON",
    bankAccounts: [
      { name: "Operations card", cardHolderUserId: "user-1" },
      { name: "Fuel card", cardHolderUserId: "user-2" },
    ],
  });
  assert.equal(result.success, true);

  assert.equal(
    finance.createBusinessLegalEntityInputSchema.safeParse({
      companyId: "company-1",
      defaultCurrency: "RON",
      bankAccounts: [
        { name: "Operations card", cardHolderUserId: "user-1" },
        { name: "operations CARD", cardHolderUserId: "user-2" },
      ],
    }).success,
    false,
  );
});
