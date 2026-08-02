import { InternalServerErrorException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

type MoneyValue = string | { toString(): string };

export interface ExpenseReportFact {
  id: string;
  currency: string;
  grossAmount: MoneyValue;
  recognizedCostAmount: MoneyValue;
  payment: {
    source: v1.finance.ExpensePaymentSource;
  };
  attribution: {
    target: v1.finance.ExpenseAttributionTarget;
    businessOwnerId: string | null;
    allocatedGrossAmount: MoneyValue;
    allocatedRecognizedCostAmount: MoneyValue;
    owner: {
      userId: string;
      user: v1.finance.FinanceUserSummary;
    } | null;
  };
  documents: Array<{
    reviewStatus: v1.finance.ExpenseDocumentReviewStatus;
    buyerCuiStatus: v1.finance.ExpenseBuyerCuiStatus;
  }>;
}

export interface ExpenseReimbursementReportFact {
  currency: string;
  status: v1.finance.ExpenseReimbursementStatus;
  originalAmount: MoneyValue;
  settledAmount: MoneyValue;
  outstandingAmount: MoneyValue;
}

interface ReportContext {
  from: string;
  to: string;
  generatedAt: string;
}

interface MutableAttributionCurrency {
  totalGross: bigint;
  totalRecognized: bigint;
  businessGross: bigint;
  businessRecognized: bigint;
  ownerGross: bigint;
  ownerRecognized: bigint;
  expenseCount: number;
  owners: Map<string, MutableOwnerAttribution>;
}

interface MutableOwnerAttribution {
  userId: string;
  owner: v1.finance.FinanceUserSummary;
  gross: bigint;
  recognized: bigint;
  expenseCount: number;
}

interface MutablePaymentSource {
  grossAmount: bigint;
  expenseCount: number;
}

export function buildExpenseAttributionReport(
  facts: readonly ExpenseReportFact[],
  context: ReportContext,
): v1.finance.ExpenseAttributionReport {
  const currencies = new Map<string, MutableAttributionCurrency>();

  for (const fact of facts) {
    const currency = normalizedCurrency(fact.currency);
    const row = getOrCreate(currencies, currency, () => ({
      totalGross: 0n,
      totalRecognized: 0n,
      businessGross: 0n,
      businessRecognized: 0n,
      ownerGross: 0n,
      ownerRecognized: 0n,
      expenseCount: 0,
      owners: new Map<string, MutableOwnerAttribution>(),
    }));
    const gross = moneyMinor(fact.grossAmount);
    const recognized = moneyMinor(fact.recognizedCostAmount);
    const allocatedGross = moneyMinor(fact.attribution.allocatedGrossAmount);
    const allocatedRecognized = moneyMinor(
      fact.attribution.allocatedRecognizedCostAmount,
    );

    assertCompleteAllocation({
      expenseId: fact.id,
      gross,
      recognized,
      allocatedGross,
      allocatedRecognized,
    });

    row.totalGross += gross;
    row.totalRecognized += recognized;
    row.expenseCount += 1;

    if (fact.attribution.target === "BUSINESS") {
      if (fact.attribution.businessOwnerId !== null) {
        throw invalidReportFact(
          fact.id,
          "business attribution cannot reference an owner",
        );
      }
      row.businessGross += allocatedGross;
      row.businessRecognized += allocatedRecognized;
      continue;
    }

    const businessOwnerId = fact.attribution.businessOwnerId;
    const owner = fact.attribution.owner;
    if (!businessOwnerId || !owner) {
      throw invalidReportFact(
        fact.id,
        "owner attribution requires its configured owner membership",
      );
    }

    row.ownerGross += allocatedGross;
    row.ownerRecognized += allocatedRecognized;
    const ownerRow = getOrCreate<string, MutableOwnerAttribution>(
      row.owners,
      businessOwnerId,
      () => ({
        userId: owner.userId,
        owner: owner.user,
        gross: 0n,
        recognized: 0n,
        expenseCount: 0,
      }),
    );
    if (ownerRow.userId !== owner.userId) {
      throw invalidReportFact(
        fact.id,
        "one owner membership resolved to different users",
      );
    }
    ownerRow.gross += allocatedGross;
    ownerRow.recognized += allocatedRecognized;
    ownerRow.expenseCount += 1;
  }

  return {
    ...context,
    items: [...currencies.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, row]) => ({
        currency,
        totalGrossAmount: moneyString(row.totalGross),
        totalRecognizedCostAmount: moneyString(row.totalRecognized),
        businessGrossAmount: moneyString(row.businessGross),
        businessRecognizedCostAmount: moneyString(row.businessRecognized),
        ownerGrossAmount: moneyString(row.ownerGross),
        ownerRecognizedCostAmount: moneyString(row.ownerRecognized),
        unallocatedGrossAmount: moneyString(
          row.totalGross - row.businessGross - row.ownerGross,
        ),
        unallocatedRecognizedCostAmount: moneyString(
          row.totalRecognized - row.businessRecognized - row.ownerRecognized,
        ),
        expenseCount: row.expenseCount,
        owners: [...row.owners.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([businessOwnerId, owner]) => ({
            businessOwnerId,
            userId: owner.userId,
            owner: owner.owner,
            allocatedGrossAmount: moneyString(owner.gross),
            allocatedRecognizedCostAmount: moneyString(owner.recognized),
            expenseCount: owner.expenseCount,
          })),
      })),
  };
}

export function buildExpensePaymentSourceReport(
  facts: readonly ExpenseReportFact[],
  context: ReportContext,
): v1.finance.ExpensePaymentSourceReport {
  const currencies = new Map<
    string,
    Map<v1.finance.ExpensePaymentSource, MutablePaymentSource>
  >();

  for (const fact of facts) {
    const sources = getOrCreate(
      currencies,
      normalizedCurrency(fact.currency),
      () => new Map<v1.finance.ExpensePaymentSource, MutablePaymentSource>(),
    );
    const source = getOrCreate<
      v1.finance.ExpensePaymentSource,
      MutablePaymentSource
    >(sources, fact.payment.source, () => ({
      grossAmount: 0n,
      expenseCount: 0,
    }));
    source.grossAmount += moneyMinor(fact.grossAmount);
    source.expenseCount += 1;
  }

  return {
    ...context,
    items: [...currencies.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, sources]) => ({
        currency,
        sources: v1.finance.EXPENSE_PAYMENT_SOURCES.flatMap((source) => {
          const row = sources.get(source);
          return row
            ? [
                {
                  source,
                  grossAmount: moneyString(row.grossAmount),
                  expenseCount: row.expenseCount,
                },
              ]
            : [];
        }),
      })),
  };
}

export function buildExpenseDocumentReviewReport(
  facts: readonly ExpenseReportFact[],
  context: ReportContext,
): v1.finance.ExpenseDocumentReviewReport {
  const currencies = new Map<
    string,
    {
      expenseCount: number;
      expenseGross: bigint;
      missingDocumentExpenseCount: number;
      pendingDocumentCount: number;
      confirmedDocumentCount: number;
      rejectedDocumentCount: number;
      buyerCuiMismatchCount: number;
      buyerCuiMissingCount: number;
    }
  >();

  for (const fact of facts) {
    const row = getOrCreate(
      currencies,
      normalizedCurrency(fact.currency),
      () => ({
        expenseCount: 0,
        expenseGross: 0n,
        missingDocumentExpenseCount: 0,
        pendingDocumentCount: 0,
        confirmedDocumentCount: 0,
        rejectedDocumentCount: 0,
        buyerCuiMismatchCount: 0,
        buyerCuiMissingCount: 0,
      }),
    );
    row.expenseCount += 1;
    row.expenseGross += moneyMinor(fact.grossAmount);
    if (fact.documents.length === 0) {
      row.missingDocumentExpenseCount += 1;
    }
    for (const document of fact.documents) {
      if (document.reviewStatus === "PENDING") row.pendingDocumentCount += 1;
      if (document.reviewStatus === "CONFIRMED")
        row.confirmedDocumentCount += 1;
      if (document.reviewStatus === "REJECTED") row.rejectedDocumentCount += 1;
      if (document.buyerCuiStatus === "MISMATCH")
        row.buyerCuiMismatchCount += 1;
      if (document.buyerCuiStatus === "MISSING") row.buyerCuiMissingCount += 1;
    }
  }

  return {
    ...context,
    items: [...currencies.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, row]) => ({
        currency,
        expenseCount: row.expenseCount,
        expenseGrossAmount: moneyString(row.expenseGross),
        missingDocumentExpenseCount: row.missingDocumentExpenseCount,
        pendingDocumentCount: row.pendingDocumentCount,
        confirmedDocumentCount: row.confirmedDocumentCount,
        rejectedDocumentCount: row.rejectedDocumentCount,
        buyerCuiMismatchCount: row.buyerCuiMismatchCount,
        buyerCuiMissingCount: row.buyerCuiMissingCount,
      })),
  };
}

export function buildExpenseReimbursementReport(
  facts: readonly ExpenseReimbursementReportFact[],
  context: ReportContext,
): v1.finance.ExpenseReimbursementReport {
  const currencies = new Map<
    string,
    {
      original: bigint;
      settled: bigint;
      outstanding: bigint;
      statusCounts: Record<v1.finance.ExpenseReimbursementStatus, number>;
    }
  >();

  for (const fact of facts) {
    const row = getOrCreate(
      currencies,
      normalizedCurrency(fact.currency),
      () => ({
        original: 0n,
        settled: 0n,
        outstanding: 0n,
        statusCounts: {
          OPEN: 0,
          PARTIALLY_SETTLED: 0,
          SETTLED: 0,
          CANCELLED: 0,
        },
      }),
    );
    row.original += moneyMinor(fact.originalAmount);
    row.settled += moneyMinor(fact.settledAmount);
    row.outstanding += moneyMinor(fact.outstandingAmount);
    row.statusCounts[fact.status] += 1;
  }

  return {
    ...context,
    items: [...currencies.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, row]) => ({
        currency,
        originalAmount: moneyString(row.original),
        settledAmount: moneyString(row.settled),
        outstandingAmount: moneyString(row.outstanding),
        openCount: row.statusCounts.OPEN,
        partiallySettledCount: row.statusCounts.PARTIALLY_SETTLED,
        settledCount: row.statusCounts.SETTLED,
        cancelledCount: row.statusCounts.CANCELLED,
      })),
  };
}

export function expenseReportPeriodWhere(
  query: v1.finance.ExpenseReportQuery,
): {
  status: "POSTED";
  occurredOn: { gte: Date; lt: Date };
  legalEntityId?: string;
  currency?: string;
} {
  return {
    status: "POSTED",
    occurredOn: {
      gte: dateOnlyInstant(query.from),
      lt: dateOnlyInstant(query.to),
    },
    ...(query.legalEntityId ? { legalEntityId: query.legalEntityId } : {}),
    ...(query.currency ? { currency: query.currency } : {}),
  };
}

export function expenseClaimOutstandingAmount(input: {
  status: v1.finance.ExpenseReimbursementStatus;
  originalAmount: MoneyValue;
  settledAmount: MoneyValue;
}): string {
  if (input.status === "CANCELLED") return "0.00";
  const outstanding =
    moneyMinor(input.originalAmount) - moneyMinor(input.settledAmount);
  if (outstanding < 0n) {
    throw new InternalServerErrorException(
      "Expense reimbursement settled amount exceeds its original amount",
    );
  }
  return moneyString(outstanding);
}

function assertCompleteAllocation(input: {
  expenseId: string;
  gross: bigint;
  recognized: bigint;
  allocatedGross: bigint;
  allocatedRecognized: bigint;
}): void {
  if (
    input.allocatedGross !== input.gross ||
    input.allocatedRecognized !== input.recognized
  ) {
    throw invalidReportFact(
      input.expenseId,
      "allocated amounts must exactly equal the expense cost pool",
    );
  }
}

function invalidReportFact(
  expenseId: string,
  message: string,
): InternalServerErrorException {
  return new InternalServerErrorException(
    `Expense ${expenseId} is not reportable: ${message}`,
  );
}

function dateOnlyInstant(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizedCurrency(currency: string): string {
  return currency.toUpperCase();
}

function moneyMinor(value: MoneyValue): bigint {
  const text = value.toString();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new InternalServerErrorException(
      `Invalid non-negative reporting amount: ${text}`,
    );
  }
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function moneyString(minor: bigint): string {
  if (minor < 0n) {
    throw new InternalServerErrorException(
      "Expense reporting produced a negative aggregate",
    );
  }
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const value = create();
  map.set(key, value);
  return value;
}
