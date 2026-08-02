import { InternalServerErrorException } from "@nestjs/common";

import type {
  ExpenseReimbursementReportFact,
  ExpenseReportFact,
} from "./expense-reporting.aggregator";
import {
  buildExpenseAttributionReport,
  buildExpenseDocumentReviewReport,
  buildExpensePaymentSourceReport,
  buildExpenseReimbursementReport,
  expenseClaimOutstandingAmount,
  expenseReportPeriodWhere,
} from "./expense-reporting.aggregator";

const context = {
  from: "2026-01-01",
  to: "2026-02-01",
  generatedAt: "2026-02-02T12:00:00.000Z",
};

const owner = {
  id: "user-owner",
  email: "owner@example.com",
  firstName: "Ada",
  lastName: "Owner",
};

const facts: ExpenseReportFact[] = [
  {
    id: "business-ron",
    currency: "RON",
    grossAmount: "100.00",
    recognizedCostAmount: "80.00",
    payment: { source: "COMPANY_CARD" },
    attribution: {
      target: "BUSINESS",
      businessOwnerId: null,
      allocatedGrossAmount: "100.00",
      allocatedRecognizedCostAmount: "80.00",
      owner: null,
    },
    documents: [
      { reviewStatus: "CONFIRMED", buyerCuiStatus: "MATCHED" },
      { reviewStatus: "PENDING", buyerCuiStatus: "MISSING" },
    ],
  },
  {
    id: "owner-ron",
    currency: "RON",
    grossAmount: "25.00",
    recognizedCostAmount: "25.00",
    payment: { source: "PERSONAL_FUNDS" },
    attribution: {
      target: "OWNER",
      businessOwnerId: "membership-1",
      allocatedGrossAmount: "25.00",
      allocatedRecognizedCostAmount: "25.00",
      owner: { userId: owner.id, user: owner },
    },
    documents: [],
  },
  {
    id: "business-eur",
    currency: "EUR",
    grossAmount: "10.50",
    recognizedCostAmount: "10.50",
    payment: { source: "PERSONAL_FUNDS" },
    attribution: {
      target: "BUSINESS",
      businessOwnerId: null,
      allocatedGrossAmount: "10.50",
      allocatedRecognizedCostAmount: "10.50",
      owner: null,
    },
    documents: [{ reviewStatus: "REJECTED", buyerCuiStatus: "MISMATCH" }],
  },
];

describe("expense reporting aggregation", () => {
  it("keeps currencies separate and preserves business-versus-owner totals", () => {
    expect(buildExpenseAttributionReport(facts, context)).toEqual({
      ...context,
      items: [
        {
          currency: "EUR",
          totalGrossAmount: "10.50",
          totalRecognizedCostAmount: "10.50",
          businessGrossAmount: "10.50",
          businessRecognizedCostAmount: "10.50",
          ownerGrossAmount: "0.00",
          ownerRecognizedCostAmount: "0.00",
          unallocatedGrossAmount: "0.00",
          unallocatedRecognizedCostAmount: "0.00",
          expenseCount: 1,
          owners: [],
        },
        {
          currency: "RON",
          totalGrossAmount: "125.00",
          totalRecognizedCostAmount: "105.00",
          businessGrossAmount: "100.00",
          businessRecognizedCostAmount: "80.00",
          ownerGrossAmount: "25.00",
          ownerRecognizedCostAmount: "25.00",
          unallocatedGrossAmount: "0.00",
          unallocatedRecognizedCostAmount: "0.00",
          expenseCount: 2,
          owners: [
            {
              businessOwnerId: "membership-1",
              userId: "user-owner",
              owner,
              allocatedGrossAmount: "25.00",
              allocatedRecognizedCostAmount: "25.00",
              expenseCount: 1,
            },
          ],
        },
      ],
    });
  });

  it("rejects corrupt allocations before a negative aggregate can escape", () => {
    expect(() =>
      buildExpenseAttributionReport(
        [
          {
            ...facts[0],
            attribution: {
              ...facts[0].attribution,
              allocatedGrossAmount: "100.01",
            },
          },
        ],
        context,
      ),
    ).toThrow(InternalServerErrorException);

    expect(() =>
      buildExpenseAttributionReport(
        [
          {
            ...facts[0],
            attribution: {
              ...facts[0].attribution,
              allocatedRecognizedCostAmount: "79.99",
            },
          },
        ],
        context,
      ),
    ).toThrow(InternalServerErrorException);
  });

  it("summarizes payment sources from expenses without ledger rows", () => {
    expect(buildExpensePaymentSourceReport(facts, context)).toEqual({
      ...context,
      items: [
        {
          currency: "EUR",
          sources: [
            {
              source: "PERSONAL_FUNDS",
              grossAmount: "10.50",
              expenseCount: 1,
            },
          ],
        },
        {
          currency: "RON",
          sources: [
            {
              source: "COMPANY_CARD",
              grossAmount: "100.00",
              expenseCount: 1,
            },
            {
              source: "PERSONAL_FUNDS",
              grossAmount: "25.00",
              expenseCount: 1,
            },
          ],
        },
      ],
    });
  });

  it("reports document review state without treating POS data as tax data", () => {
    expect(buildExpenseDocumentReviewReport(facts, context)).toEqual({
      ...context,
      items: [
        {
          currency: "EUR",
          expenseCount: 1,
          expenseGrossAmount: "10.50",
          missingDocumentExpenseCount: 0,
          pendingDocumentCount: 0,
          confirmedDocumentCount: 0,
          rejectedDocumentCount: 1,
          buyerCuiMismatchCount: 1,
          buyerCuiMissingCount: 0,
        },
        {
          currency: "RON",
          expenseCount: 2,
          expenseGrossAmount: "125.00",
          missingDocumentExpenseCount: 1,
          pendingDocumentCount: 1,
          confirmedDocumentCount: 1,
          rejectedDocumentCount: 0,
          buyerCuiMismatchCount: 0,
          buyerCuiMissingCount: 1,
        },
      ],
    });
  });

  it("uses claim state directly and does not re-sum settlement postings", () => {
    const claims: ExpenseReimbursementReportFact[] = [
      {
        currency: "RON",
        status: "OPEN",
        originalAmount: "100.00",
        settledAmount: "0.00",
        outstandingAmount: "100.00",
      },
      {
        currency: "RON",
        status: "PARTIALLY_SETTLED",
        originalAmount: "50.00",
        settledAmount: "20.00",
        outstandingAmount: "30.00",
      },
      {
        currency: "EUR",
        status: "SETTLED",
        originalAmount: "10.00",
        settledAmount: "10.00",
        outstandingAmount: "0.00",
      },
    ];

    expect(buildExpenseReimbursementReport(claims, context)).toEqual({
      ...context,
      items: [
        {
          currency: "EUR",
          originalAmount: "10.00",
          settledAmount: "10.00",
          outstandingAmount: "0.00",
          openCount: 0,
          partiallySettledCount: 0,
          settledCount: 1,
          cancelledCount: 0,
        },
        {
          currency: "RON",
          originalAmount: "150.00",
          settledAmount: "20.00",
          outstandingAmount: "130.00",
          openCount: 1,
          partiallySettledCount: 1,
          settledCount: 0,
          cancelledCount: 0,
        },
      ],
    });
  });

  it("builds a posted-only half-open date predicate", () => {
    expect(
      expenseReportPeriodWhere({
        from: "2026-01-01",
        to: "2026-02-01",
        legalEntityId: "entity-1",
        currency: "RON",
      }),
    ).toEqual({
      status: "POSTED",
      occurredOn: {
        gte: new Date("2026-01-01T00:00:00.000Z"),
        lt: new Date("2026-02-01T00:00:00.000Z"),
      },
      legalEntityId: "entity-1",
      currency: "RON",
    });
  });

  it("derives outstanding liability from claim state, with cancellation at zero", () => {
    expect(
      expenseClaimOutstandingAmount({
        status: "PARTIALLY_SETTLED",
        originalAmount: "50.00",
        settledAmount: "20.00",
      }),
    ).toBe("30.00");
    expect(
      expenseClaimOutstandingAmount({
        status: "CANCELLED",
        originalAmount: "50.00",
        settledAmount: "0.00",
      }),
    ).toBe("0.00");
  });
});
