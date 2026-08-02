import { Prisma } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { FinanceReportingService } from "./finance-reporting.service";

describe("FinanceReportingService specialized expenses", () => {
  it("adds posted expense aggregates and excludes their linked ledger rows", async () => {
    const moneyGroupBy = jest
      .fn()
      .mockResolvedValueOnce([
        {
          type: "INCOME",
          currency: "RON",
          _sum: { amount: new Prisma.Decimal(100) },
        },
        {
          type: "EXPENSE",
          currency: "RON",
          _sum: { amount: new Prisma.Decimal(20) },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          categoryId: "category-1",
          currency: "RON",
          _sum: { amount: new Prisma.Decimal(20) },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const expenseGroupBy = jest
      .fn()
      .mockResolvedValueOnce([
        {
          currency: "RON",
          _sum: { grossAmount: new Prisma.Decimal(30) },
        },
      ])
      .mockResolvedValueOnce([
        {
          categoryId: "category-1",
          currency: "RON",
          _sum: { grossAmount: new Prisma.Decimal(30) },
        },
      ]);
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ generatedAt: new Date("2026-08-02T00:00:00Z") }]),
      moneyTransaction: { groupBy: moneyGroupBy },
      expense: { groupBy: expenseGroupBy },
      financialCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "category-1",
            code: "OPS",
            name: "Operations",
            kind: "EXPENSE",
          },
        ]),
      },
      wallet: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    } as unknown as PrismaService;

    const result = await new FinanceReportingService(prisma).getSummary({
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
    });

    expect(result.expenses).toEqual([{ currency: "RON", amount: "50.00" }]);
    expect(result.totals).toEqual([
      { currency: "RON", income: "100.00", expenses: "50.00" },
    ]);
    expect(result.expensesByCategory).toEqual([
      {
        category: {
          id: "category-1",
          code: "OPS",
          name: "Operations",
          kind: "EXPENSE",
        },
        currency: "RON",
        amount: "50.00",
      },
    ]);

    const moneyGroupByCalls = moneyGroupBy.mock.calls as unknown as Array<
      [unknown]
    >;
    const expenseGroupByCalls = expenseGroupBy.mock.calls as unknown as Array<
      [unknown]
    >;
    const totalsQuery = moneyGroupByCalls[0]?.[0] as {
      where: { OR: unknown[] };
    };
    expect(totalsQuery.where.OR).toContainEqual({
      type: "EXPENSE",
      expensePostings: {
        none: { role: "EXPENSE_PAYMENT" },
      },
    });
    expect(expenseGroupByCalls[0]?.[0]).toMatchObject({
      where: { status: "POSTED" },
      _sum: { grossAmount: true },
    });
  });
});
