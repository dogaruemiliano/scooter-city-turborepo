import { MoneyTransactionType, Prisma } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "./companies.service";

describe("CompaniesService statistics", () => {
  it("aggregates posted income and expenses for only the company counterparty", async () => {
    const groupBy = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        type: MoneyTransactionType.INCOME,
        currency: "RON",
        _sum: { amount: new Prisma.Decimal(250) },
        _count: { _all: 2 },
      },
      {
        type: MoneyTransactionType.EXPENSE,
        currency: "RON",
        _sum: { amount: new Prisma.Decimal(100) },
        _count: { _all: 1 },
      },
    ]);
    const prisma = {
      company: {
        findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
          id: "company-1",
          counterparty: { id: "counterparty-1" },
          businessLegalEntity: null,
        }),
      },
      moneyTransaction: { groupBy },
    } as unknown as PrismaService;

    const result = await new CompaniesService(prisma).stats("company-1", {
      period: "ALL",
    });

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          counterpartyId: "counterparty-1",
          status: "POSTED",
          occurredAt: expect.not.objectContaining({
            gte: expect.anything() as unknown,
          }) as unknown,
        }) as unknown,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        period: "ALL",
        from: null,
        transactionCount: 3,
        totals: [
          {
            currency: "RON",
            income: "250.00",
            expenses: "100.00",
            net: "150.00",
          },
        ],
      }),
    );
  });

  it("aggregates operating-company activity through its assigned wallets", async () => {
    const groupBy = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([
      {
        type: MoneyTransactionType.INCOME,
        currency: "RON",
        _sum: { amount: new Prisma.Decimal(500) },
        _count: { _all: 4 },
      },
      {
        type: MoneyTransactionType.EXPENSE,
        currency: "RON",
        _sum: { amount: new Prisma.Decimal(125) },
        _count: { _all: 2 },
      },
    ]);
    const prisma = {
      company: {
        findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
          id: "company-jusem",
          counterparty: { id: "counterparty-jusem" },
          businessLegalEntity: { id: "legal-entity-jusem" },
        }),
      },
      moneyTransaction: { groupBy },
    } as unknown as PrismaService;

    const result = await new CompaniesService(prisma).stats("company-jusem", {
      period: "ALL",
    });

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          balanceChanges: {
            some: {
              wallet: {
                businessLegalEntities: {
                  some: { legalEntityId: "legal-entity-jusem" },
                },
              },
            },
          },
          status: "POSTED",
          type: { in: ["INCOME", "EXPENSE"] },
        }) as unknown,
      }),
    );
    expect(
      (groupBy.mock.calls[0]?.[0] as { where?: unknown } | undefined)?.where,
    ).not.toHaveProperty("counterpartyId");
    expect(result).toEqual(
      expect.objectContaining({
        transactionCount: 6,
        totals: [
          {
            currency: "RON",
            income: "500.00",
            expenses: "125.00",
            net: "375.00",
          },
        ],
      }),
    );
  });
});

describe("CompaniesService soft delete", () => {
  it("stamps deletedAt and deactivates the counterparty in one transaction", async () => {
    const companyUpdate = jest.fn().mockResolvedValue({});
    const counterpartyUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      company: { update: companyUpdate },
      counterparty: { update: counterpartyUpdate },
    };
    const prisma = {
      company: {
        findFirst: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue({ id: "company-1" }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((run: (client: unknown) => unknown) => run(tx)),
    } as unknown as PrismaService;

    await new CompaniesService(prisma).softDelete("company-1");

    expect(companyUpdate).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { deletedAt: expect.any(Date) as unknown },
    });
    expect(counterpartyUpdate).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      data: { isActive: false },
    });
  });

  it("rejects a company that is already deleted", async () => {
    const transaction = jest.fn();
    const prisma = {
      company: {
        findFirst: jest
          .fn<Promise<unknown>, [unknown]>()
          .mockResolvedValue(null),
      },
      $transaction: transaction,
    } as unknown as PrismaService;

    await expect(
      new CompaniesService(prisma).softDelete("company-1"),
    ).rejects.toThrow("Company not found");
    expect(transaction).not.toHaveBeenCalled();
  });
});
