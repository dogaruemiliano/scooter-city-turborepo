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

describe("FinanceReportingService owner balances", () => {
  it("groups USER_SETTLEMENT balances by currently active owner, sorted by name", async () => {
    const businessOwnerFindMany = jest
      .fn()
      .mockResolvedValue([{ userId: "owner-1" }, { userId: "owner-2" }]);
    const walletBalanceFindMany = jest.fn().mockResolvedValue([
      {
        currency: "RON",
        balance: new Prisma.Decimal(150),
        wallet: {
          ownerUserId: "owner-1",
          owner: {
            id: "owner-1",
            email: "owner1@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        },
      },
      {
        currency: "RON",
        balance: new Prisma.Decimal(0),
        wallet: {
          ownerUserId: "owner-2",
          owner: {
            id: "owner-2",
            email: "owner2@example.com",
            firstName: "Grace",
            lastName: "Hopper",
          },
        },
      },
    ]);
    const prisma = {
      businessOwner: { findMany: businessOwnerFindMany },
      walletBalance: { findMany: walletBalanceFindMany },
    } as unknown as PrismaService;

    const result = await new FinanceReportingService(prisma).getOwnerBalances();

    expect(result.items).toEqual([
      {
        userId: "owner-2",
        user: {
          id: "owner-2",
          email: "owner2@example.com",
          firstName: "Grace",
          lastName: "Hopper",
        },
        currency: "RON",
        amount: "0.00",
      },
      {
        userId: "owner-1",
        user: {
          id: "owner-1",
          email: "owner1@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
        currency: "RON",
        amount: "150.00",
      },
    ]);
    expect(businessOwnerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { deletedAt: null },
        }) as unknown,
        distinct: ["userId"],
      }),
    );
    expect(walletBalanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bucket: "USER_SETTLEMENT",
          wallet: { ownerUserId: { in: ["owner-1", "owner-2"] } },
        }) as unknown,
      }),
    );
  });

  it("skips the wallet-balance lookup when there are no currently active owners", async () => {
    const businessOwnerFindMany = jest.fn().mockResolvedValue([]);
    const walletBalanceFindMany = jest.fn();
    const prisma = {
      businessOwner: { findMany: businessOwnerFindMany },
      walletBalance: { findMany: walletBalanceFindMany },
    } as unknown as PrismaService;

    const result = await new FinanceReportingService(prisma).getOwnerBalances();

    expect(result.items).toEqual([]);
    expect(walletBalanceFindMany).not.toHaveBeenCalled();
  });
});
