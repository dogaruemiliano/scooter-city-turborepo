import { InternalServerErrorException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type { PrismaService } from "../prisma/prisma.service";
import { ExpenseReportingService } from "./expense-reporting.service";

describe("ExpenseReportingService", () => {
  const expenseFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const claimFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
  const prisma = {
    expense: { findMany: expenseFindMany },
    expenseReimbursementClaim: { findMany: claimFindMany },
  } as unknown as PrismaService;
  const service = new ExpenseReportingService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-02-02T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads posted expense snapshots with a half-open predicate, never ledger postings", async () => {
    expenseFindMany.mockResolvedValue([
      {
        id: "expense-1",
        currency: "RON",
        payment: { source: "COMPANY_CARD" },
        costPool: {
          grossAmount: "125.00",
          recognizedCostAmount: "100.00",
          attribution: {
            target: "BUSINESS",
            businessOwnerId: null,
            allocatedGrossAmount: "125.00",
            allocatedRecognizedCostAmount: "100.00",
            businessOwner: null,
          },
        },
        documents: [],
      },
    ]);

    const report = await service.getAttributionReport({
      from: "2026-01-01",
      to: "2026-02-01",
      legalEntityId: "entity-1",
      currency: "RON",
    });

    expect(expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "POSTED",
          occurredOn: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lt: new Date("2026-02-01T00:00:00.000Z"),
          },
          legalEntityId: "entity-1",
          currency: "RON",
        },
      }),
    );
    expect(JSON.stringify(expenseFindMany.mock.calls[0][0])).not.toMatch(
      /posting|moneyTransaction|settlement/iu,
    );
    expect(
      v1.finance.expenseAttributionReportSchema.safeParse(report).success,
    ).toBe(true);
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        totalGrossAmount: "125.00",
        businessGrossAmount: "125.00",
        ownerGrossAmount: "0.00",
        unallocatedGrossAmount: "0.00",
      }),
    );
  });

  it("reports stored claim totals and computes outstanding without settlement rows", async () => {
    claimFindMany.mockResolvedValue([
      {
        currency: "RON",
        status: "PARTIALLY_SETTLED",
        originalAmount: "50.00",
        settledAmount: "20.00",
      },
      {
        currency: "RON",
        status: "CANCELLED",
        originalAmount: "10.00",
        settledAmount: "0.00",
      },
    ]);

    const report = await service.getReimbursementReport({
      from: "2026-01-01",
      to: "2026-02-01",
    });

    expect(claimFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          expense: {
            is: {
              status: "POSTED",
              occurredOn: {
                gte: new Date("2026-01-01T00:00:00.000Z"),
                lt: new Date("2026-02-01T00:00:00.000Z"),
              },
            },
          },
        },
      }),
    );
    expect(JSON.stringify(claimFindMany.mock.calls[0][0])).not.toMatch(
      /posting|moneyTransaction|settlement/iu,
    );
    expect(
      v1.finance.expenseReimbursementReportSchema.safeParse(report).success,
    ).toBe(true);
    expect(report.items).toEqual([
      {
        currency: "RON",
        originalAmount: "60.00",
        settledAmount: "20.00",
        outstandingAmount: "30.00",
        openCount: 0,
        partiallySettledCount: 1,
        settledCount: 0,
        cancelledCount: 1,
      },
    ]);
  });

  it("fails closed when a posted expense is missing its reporting snapshot", async () => {
    expenseFindMany.mockResolvedValue([
      {
        id: "expense-corrupt",
        currency: "RON",
        payment: null,
        costPool: null,
        documents: [],
      },
    ]);

    await expect(
      service.getPaymentSourceReport({
        from: "2026-01-01",
        to: "2026-02-01",
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
