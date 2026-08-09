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
    counterpartyId: "counterparty-1",
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

const financeUserSummary = {
  id: "user-1",
  email: "owner@example.com",
  firstName: "Ana",
  lastName: "Popescu",
} as const;

const financeWalletSummary = {
  id: "wallet-1",
  type: "USER",
  ownerUserId: financeUserSummary.id,
  name: "Ana's wallet",
  owner: financeUserSummary,
} as const;

const financeCategorySummary = {
  id: "category-1",
  code: "RENTAL_INCOME",
  name: "Rental income",
  kind: "INCOME",
} as const;

test("financial category creation accepts user-facing fields without a code", () => {
  const parsed = finance.createFinancialCategoryInputSchema.parse({
    name: "Rental income",
    kind: "INCOME",
    parentCategoryId: null,
  });

  assert.deepEqual(parsed, {
    name: "Rental income",
    kind: "INCOME",
    keywords: [],
    parentCategoryId: null,
  });
  assert.equal(
    finance.createFinancialCategoryInputSchema.safeParse({
      ...parsed,
      code: "MANUAL_CODE",
    }).success,
    false,
  );
  assert.equal(
    finance.createFinancialCategoryInputSchema.safeParse({
      ...parsed,
      kind: "BOTH",
    }).success,
    false,
  );
});

test("company contracts require a supported legal form", () => {
  const company = {
    legalName: "Scooter City",
    legalForm: "ONG",
  };

  assert.equal(
    finance.createCompanyInputSchema.safeParse(company).success,
    true,
  );
  assert.equal(
    finance.createCompanyInputSchema.safeParse({ legalName: "Scooter City" })
      .success,
    false,
  );
  assert.equal(
    finance.createCompanyInputSchema.safeParse({
      ...company,
      legalForm: "SNC",
    }).success,
    false,
  );
});

test("company activity contracts support period totals and counterparty filtering", () => {
  assert.deepEqual(finance.companyStatsQuerySchema.parse({}), {
    period: "MONTH",
  });
  assert.equal(
    finance.companyStatsSchema.safeParse({
      period: "YEAR",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-08-02T12:00:00.000Z",
      transactionCount: 2,
      totals: [
        {
          currency: "RON",
          income: "250.00",
          expenses: "100.00",
          net: "150.00",
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    finance.listMoneyTransactionsQuerySchema.parse({
      counterpartyId: "counterparty-1",
    }).counterpartyId,
    "counterparty-1",
  );
  assert.equal(
    finance.listMoneyTransactionsQuerySchema.parse({
      businessLegalEntityId: "legal-entity-1",
    }).businessLegalEntityId,
    "legal-entity-1",
  );
  assert.deepEqual(
    finance.listMoneyTransactionsQuerySchema.parse({
      types: "INCOME,EXPENSE",
    }).types,
    ["INCOME", "EXPENSE"],
  );
});

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

test("finance transaction input requires a category for expenses", () => {
  const expense = {
    ...validTransactionInput(),
    type: "EXPENSE",
    balanceChanges: [
      {
        walletId: "wallet-1",
        bucket: "BUSINESS_FUNDS",
        currency: "RON",
        amountDelta: "-125.50",
      },
    ],
  } as const;

  assert.equal(
    finance.createMoneyTransactionInputSchema.safeParse(expense).success,
    false,
  );
  assert.equal(
    finance.createMoneyTransactionInputSchema.safeParse({
      ...expense,
      categoryId: "category-1",
      description: "Cash expense without a known recipient",
    }).success,
    true,
  );
});

test("finance transaction input requires a payer for income", () => {
  const income = validTransactionInput();
  const result = finance.createMoneyTransactionInputSchema.safeParse({
    ...income,
    counterpartyId: null,
  });

  assert.equal(result.success, false);
  assert.equal(result.error?.issues[0]?.path[0], "counterpartyId");
});

test("finance transaction input requires a description for an expense without a recipient", () => {
  const expense = {
    ...validTransactionInput(),
    type: "EXPENSE",
    categoryId: "category-1",
    counterpartyId: null,
    balanceChanges: [
      {
        walletId: "wallet-1",
        bucket: "BUSINESS_FUNDS",
        currency: "RON",
        amountDelta: "-125.50",
      },
    ],
  } as const;

  assert.equal(
    finance.createMoneyTransactionInputSchema.safeParse(expense).success,
    false,
  );
  assert.equal(
    finance.createMoneyTransactionInputSchema.safeParse({
      ...expense,
      description: "Cash expense without a known recipient",
    }).success,
    true,
  );
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
  assert.equal(finance.signedMoneyAmountSchema.safeParse("0").success, true);
  assert.equal(
    finance.signedMoneyAmountSchema.safeParse("-10.25").success,
    true,
  );
});

test("finance aggregate responses allow totals larger than one money row", () => {
  const aggregate = "199999999999999999.98";

  assert.equal(
    finance.aggregateMoneyAmountSchema.safeParse(aggregate).success,
    true,
  );
  assert.equal(
    finance.positiveAggregateMoneyAmountSchema.safeParse(aggregate).success,
    true,
  );
  assert.equal(finance.moneyAmountSchema.safeParse(aggregate).success, false);
  assert.equal(
    finance.positiveAggregateMoneyAmountSchema.safeParse("0.00").success,
    false,
  );
});

test("counterparty search supports a popular preview and bounded queries", () => {
  assert.equal(
    finance.searchFinancialCounterpartiesQuerySchema.safeParse({
      search: "a",
    }).success,
    false,
  );

  const parsed = finance.searchFinancialCounterpartiesQuerySchema.parse({
    search: "  Ada   Lovelace  ",
    pageSize: "20",
  });

  assert.equal(parsed.search, "Ada Lovelace");
  assert.equal(parsed.pageSize, 20);
  assert.equal(parsed.transactionType, "EXPENSE");
  assert.equal(
    finance.searchFinancialCounterpartiesQuerySchema.parse({}).search,
    "",
  );
});

test("counterparty search summaries never contain raw identity documents", () => {
  const parsed = finance.financialCounterpartySearchItemSchema.parse({
    id: "counterparty-1",
    kind: "PERSON",
    label: "Ada Lovelace",
    description: "Person · ada@example.com",
    email: "ada@example.com",
    phoneMasked: "+40 ••• ••• 678",
    identifierMasked: null,
  });

  assert.equal("cnp" in parsed, false);
});

test("wallet list query normalizes search and coerces owner filters", () => {
  assert.deepEqual(
    finance.listWalletsQuerySchema.parse({
      page: "2",
      pageSize: "10",
      type: "USER",
      isActive: "0",
      ownerIsActive: "1",
      ownerRole: "  ADMIN  ",
      search: "  Ana \t Maria   Popescu  ",
    }),
    {
      page: 2,
      pageSize: 10,
      type: "USER",
      isActive: false,
      ownerIsActive: true,
      ownerRole: "ADMIN",
      search: "Ana Maria Popescu",
    },
  );

  assert.equal(
    finance.listWalletsQuerySchema.parse({ search: " \t " }).search,
    undefined,
  );
  assert.equal(
    finance.listWalletsQuerySchema.safeParse({ ownerRole: "USER" }).success,
    false,
  );
});

test("wallet option contracts stay lightweight and cursor-paginated", () => {
  const query = finance.listWalletOptionsQuerySchema.parse({
    search: "  aDa \t loVELace  ",
    type: "USER",
    ownerRole: " ADMIN ",
    ownerUserId: " user-1 ",
    isActive: "1",
  });

  assert.deepEqual(query, {
    search: "aDa loVELace",
    type: "USER",
    ownerRole: "ADMIN",
    ownerUserId: "user-1",
    isActive: true,
    pageSize: 25,
  });
  assert.equal(
    finance.listWalletOptionsQuerySchema.safeParse({ pageSize: "101" }).success,
    false,
  );
  assert.equal(
    finance.listWalletOptionsQuerySchema.safeParse({ ownerRole: "USER" })
      .success,
    false,
  );
  assert.equal(
    finance.listWalletOptionsQuerySchema.parse({ companyOnly: "true" })
      .companyOnly,
    true,
  );
  assert.equal(
    finance.listWalletOptionsQuerySchema.safeParse({
      companyOnly: "true",
      type: "USER",
    }).success,
    false,
  );
  assert.equal(
    finance.listWalletOptionsQuerySchema.safeParse({
      companyOnly: "true",
      ownerUserId: "user-1",
    }).success,
    false,
  );
  assert.equal(
    finance.listWalletOptionsQuerySchema.safeParse({
      cursor: " opaque_cursor ",
    }).success,
    false,
  );

  const option = {
    id: "wallet-1",
    type: "USER",
    name: "Personal wallet",
    isActive: true,
    owner: financeUserSummary,
    cardHolderUserId: null,
    cardHolder: null,
  } as const;
  assert.deepEqual(
    finance.walletOptionListSchema.parse({
      items: [option],
      nextCursor: "opaque_cursor",
    }),
    {
      items: [option],
      nextCursor: "opaque_cursor",
    },
  );
  assert.equal(
    finance.walletOptionSchema.safeParse({
      ...option,
      balances: [],
    }).success,
    false,
  );
});

test("wallet option cursor payload is versioned and strict", () => {
  const payload = {
    version: 1,
    id: "wallet-1",
    sortFingerprint: "s".repeat(43),
    filterFingerprint: "f".repeat(43),
  } as const;

  assert.deepEqual(
    finance.walletOptionCursorPayloadSchema.parse(payload),
    payload,
  );
  assert.equal(
    finance.walletOptionCursorPayloadSchema.safeParse({
      ...payload,
      unexpected: true,
    }).success,
    false,
  );
  assert.equal(
    finance.walletOptionCursorPayloadSchema.safeParse({
      ...payload,
      version: 2,
    }).success,
    false,
  );
});

test("transaction list query compares parsed instants as a half-open period", () => {
  assert.equal(
    finance.listMoneyTransactionsQuerySchema.parse({
      userId: "participant-1",
      recordedByUserId: "operator-1",
    }).recordedByUserId,
    "operator-1",
  );
  assert.equal(
    finance.listMoneyTransactionsQuerySchema.safeParse({
      from: "2026-07-29T12:00:00.000+02:00",
      to: "2026-07-29T10:30:00.000Z",
    }).success,
    true,
  );
  assert.equal(
    finance.listMoneyTransactionsQuerySchema.safeParse({
      from: "2026-07-29T10:30:00.000Z",
      to: "2026-07-29T12:00:00.000+02:00",
    }).success,
    false,
  );
  assert.equal(
    finance.listMoneyTransactionsQuerySchema.safeParse({
      from: "2026-07-29T00:00:00.000Z",
      to: "2026-07-29T00:00:00.000Z",
    }).success,
    false,
  );
});

test("finance summary query compares parsed instants and preserves boundaries", () => {
  const parsed = finance.financeSummaryQuerySchema.parse({
    from: "2026-07-29T12:00:00.000+02:00",
    to: "2026-07-29T10:30:00.000Z",
  });

  assert.deepEqual(parsed, {
    from: "2026-07-29T12:00:00.000+02:00",
    to: "2026-07-29T10:30:00.000Z",
  });
  assert.equal(
    finance.financeSummaryQuerySchema.safeParse({
      from: "2026-07-29T10:30:00.000Z",
      to: "2026-07-29T12:00:00.000+02:00",
    }).success,
    false,
  );
});

test("finance summary query uses a non-empty half-open period", () => {
  assert.equal(
    finance.financeSummaryQuerySchema.safeParse({
      from: "2026-07-29T00:00:00.000Z",
      to: "2026-07-29T00:00:00.000Z",
    }).success,
    false,
  );
  assert.match(
    finance.financeSummaryQuerySchema.shape.from.description ?? "",
    /Inclusive start.*half-open/,
  );
  assert.match(
    finance.financeSummaryQuerySchema.shape.to.description ?? "",
    /Exclusive end.*half-open/,
  );
});

test("finance summary query limits reporting periods to 366 days", () => {
  assert.equal(
    finance.financeSummaryQuerySchema.safeParse({
      from: "2025-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    }).success,
    true,
  );
  assert.equal(
    finance.financeSummaryQuerySchema.safeParse({
      from: "2025-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.001Z",
    }).success,
    false,
  );
});

test("finance summary includes generated time and signed balance snapshots", () => {
  const parsed = finance.financeSummarySchema.parse({
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
    period: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    },
    generatedAt: "2026-08-01T00:00:01.000Z",
    income: [{ currency: "RON", amount: "199999999999999999.98" }],
    expenses: [{ currency: "RON", amount: "25.50" }],
    totals: [
      {
        currency: "RON",
        income: "199999999999999999.98",
        expenses: "25.50",
      },
    ],
    incomeByPaymentMethod: [
      { currency: "RON", paymentMethod: "CASH", amount: "100.00" },
    ],
    expensesByCategory: [
      {
        currency: "RON",
        category: financeCategorySummary,
        amount: "25.50",
      },
    ],
    incomeByBillingStatus: [
      { currency: "RON", billingStatus: "BILLED", amount: "100.00" },
    ],
    incomeByScope: [
      { currency: "RON", financialScope: "COMPANY", amount: "100.00" },
    ],
    companyMoney: [
      {
        walletId: "company-wallet-1",
        walletType: "COMPANY_CASH",
        walletName: "Main cash desk",
        currency: "RON",
        amount: "0.00",
      },
    ],
    adminMoney: [
      {
        admin: financeUserSummary,
        currency: "RON",
        businessFunds: "0.00",
        personalFunds: "-25.50",
        customerGuaranteeFunds: "0.00",
      },
    ],
    currentBalances: {
      company: [
        {
          wallet: {
            id: "company-wallet-1",
            type: "COMPANY_CASH",
            ownerUserId: null,
            name: "Main cash desk",
            owner: null,
          },
          bucket: "BUSINESS_FUNDS",
          currency: "RON",
          balance: "0",
          ownerIsActive: null,
          ownerIsAdmin: null,
        },
      ],
      admins: [
        {
          wallet: financeWalletSummary,
          bucket: "ADMIN_PERSONAL_FUNDS",
          currency: "RON",
          balance: "-25.50",
          ownerIsActive: true,
          ownerIsAdmin: true,
        },
      ],
    },
  });

  assert.equal(parsed.generatedAt, "2026-08-01T00:00:01.000Z");
  assert.equal(parsed.currentBalances.company[0]?.balance, "0");
  assert.equal(parsed.currentBalances.admins[0]?.balance, "-25.50");
  assert.equal(parsed.currentBalances.company[0]?.ownerIsAdmin, null);
  assert.equal(parsed.currentBalances.admins[0]?.ownerIsAdmin, true);
  assert.deepEqual(parsed.period, {
    from: parsed.from,
    to: parsed.to,
  });
  assert.equal(parsed.totals[0]?.income, "199999999999999999.98");
  assert.equal(parsed.companyMoney[0]?.walletType, "COMPANY_CASH");
  assert.equal(parsed.adminMoney[0]?.personalFunds, "-25.50");
  assert.equal(parsed.incomeByScope[0]?.financialScope, "COMPANY");
  assert.equal(
    parsed.expensesByCategory[0]?.category?.kind,
    financeCategorySummary.kind,
  );
});

test("finance transaction responses include compact relation summaries", () => {
  const parsed = finance.moneyTransactionSchema.parse({
    id: "transaction-1",
    type: "INCOME",
    status: "POSTED",
    amount: "125.50",
    currency: "RON",
    financialScope: "COMPANY",
    paymentMethod: "CASH",
    billingStatus: "BILLED",
    categoryId: financeCategorySummary.id,
    counterpartyId: "counterparty-1",
    counterpartyUserId: financeUserSummary.id,
    recipientCounterpartyId: "counterparty-1",
    recipientUserId: financeUserSummary.id,
    debtorCounterpartyId: "counterparty-1",
    debtorUserId: financeUserSummary.id,
    creditorCounterpartyId: "counterparty-1",
    creditorUserId: financeUserSummary.id,
    recordedByUserId: financeUserSummary.id,
    category: financeCategorySummary,
    counterparty: financeUserSummary,
    counterpartyEntity: {
      id: "counterparty-1",
      kind: "COMPANY",
      label: "Scooter City SRL",
    },
    recipient: financeUserSummary,
    recipientCounterparty: null,
    debtor: financeUserSummary,
    debtorCounterparty: null,
    creditor: financeUserSummary,
    creditorCounterparty: null,
    recordedBy: financeUserSummary,
    occurredAt: "2026-07-29T12:00:00.000Z",
    description: null,
    idempotencyKey: "income-1",
    originTransactionId: null,
    reversalOfTransactionId: null,
    reversalTransactionId: null,
    createdAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
    balanceChanges: [
      {
        id: "change-1",
        walletId: financeWalletSummary.id,
        wallet: financeWalletSummary,
        bucket: "BUSINESS_FUNDS",
        currency: "RON",
        amountDelta: "125.50",
        createdAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    references: [],
  });

  assert.equal(parsed.categoryId, parsed.category?.id);
  assert.equal(parsed.counterpartyUserId, parsed.counterparty?.id);
  assert.equal(parsed.counterpartyEntity?.label, "Scooter City SRL");
  assert.equal(
    parsed.balanceChanges[0]?.walletId,
    parsed.balanceChanges[0]?.wallet.id,
  );
  assert.equal(
    parsed.balanceChanges[0]?.wallet.owner?.email,
    "owner@example.com",
  );
});

test("finance transaction optional relation summaries remain nullable", () => {
  const nullableRelations = {
    category: null,
    counterparty: null,
    recipient: null,
    debtor: null,
    creditor: null,
    recordedBy: null,
  };
  const nullableRelationSchema = finance.moneyTransactionSchema.pick({
    category: true,
    counterparty: true,
    recipient: true,
    debtor: true,
    creditor: true,
    recordedBy: true,
  });

  assert.equal(
    nullableRelationSchema.safeParse(nullableRelations).success,
    true,
  );
});

test("outstanding claims preserve IDs and include participant summaries", () => {
  const parsed = finance.outstandingPersonalClaimSchema.parse({
    debtorUserId: "debtor-1",
    creditorUserId: "creditor-1",
    debtor: { ...financeUserSummary, id: "debtor-1" },
    creditor: { ...financeUserSummary, id: "creditor-1" },
    currency: "RON",
    amount: "199999999999999999.98",
  });

  assert.equal(parsed.debtorUserId, parsed.debtor.id);
  assert.equal(parsed.creditorUserId, parsed.creditor.id);
  assert.equal(parsed.amount, "199999999999999999.98");
});

test("finance routes expose stable versioned endpoint paths", () => {
  assert.equal(finance.ROUTES.summary, "/v1/finance/summary");
  assert.equal(finance.ROUTES.walletOptions, "/v1/finance/wallet-options");
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
