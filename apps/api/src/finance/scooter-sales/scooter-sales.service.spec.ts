import { BadRequestException, ConflictException } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import { ScooterSalesService } from "./scooter-sales.service";

const ACTOR = { actorUserId: "admin-1" };

const BUYER_COUNTERPARTY = {
  id: "counterparty-buyer",
  person: {
    id: "person-buyer",
    firstName: "Ana",
    lastName: "Pop",
    email: "ana@example.com",
    phone: "+40711111111",
  },
  company: null,
};

function fakeSale(overrides: Record<string, unknown> = {}) {
  return {
    id: "sale-1",
    scooterId: "scooter-1",
    buyerCounterpartyId: "counterparty-buyer",
    buyerCounterparty: BUYER_COUNTERPARTY,
    saleAmount: new Prisma.Decimal("300.00"),
    paidAmount: new Prisma.Decimal("0.00"),
    paidBusinessAmount: new Prisma.Decimal("0.00"),
    paidPersonalAmount: new Prisma.Decimal("0.00"),
    currency: "RON",
    status: "OPEN",
    soldOn: new Date("2026-01-10T00:00:00.000Z"),
    notes: null,
    createdByUserId: "admin-1",
    createdAt: new Date("2026-01-10T00:00:00.000Z"),
    updatedAt: new Date("2026-01-10T00:00:00.000Z"),
    ...overrides,
  };
}

function buildTx(overrides: Record<string, unknown> = {}) {
  return {
    scooter: { findFirst: jest.fn().mockResolvedValue({ id: "scooter-1" }) },
    scooterSale: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(fakeSale()),
      update: jest.fn(),
    },
    counterparty: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ person: { userId: "user-buyer" } }),
    },
    wallet: {
      findFirst: jest.fn().mockResolvedValue({ id: "wallet-buyer" }),
    },
    businessOwner: {
      findFirst: jest.fn().mockResolvedValue({ userId: "user-owner" }),
    },
    moneyTransaction: { create: jest.fn().mockResolvedValue({ id: "mt-1" }) },
    walletBalance: { upsert: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

function buildPrisma(
  tx: ReturnType<typeof buildTx>,
  extra: Record<string, unknown> = {},
): PrismaService {
  return {
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      Promise.resolve(operation(tx)),
    ),
    moneyTransaction: { findUnique: jest.fn().mockResolvedValue(null) },
    ...extra,
  } as unknown as PrismaService;
}

describe("ScooterSalesService.createSale", () => {
  it("charges the buyer's wallet for the full sale amount", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    const result = await service.createSale(
      {
        scooterId: "scooter-1",
        buyerCounterpartyId: "counterparty-buyer",
        saleAmount: "300.00",
        currency: "RON",
        soldOn: "2026-01-10",
        notes: null,
      },
      ACTOR,
    );

    expect(result.saleAmount).toBe("300.00");
    expect(result.paidAmount).toBe("0.00");
    expect(result.outstandingAmount).toBe("300.00");
    expect(result.status).toBe("OPEN");

    const [[createArgs]] = tx.moneyTransaction.create.mock.calls;
    expect(createArgs.data.type).toBe("USER_CHARGE");
    expect(createArgs.data.counterpartyUserId).toBe("user-buyer");
    expect(createArgs.data.amount.toString()).toBe("300");
    expect(createArgs.data.balanceChanges.create).toEqual(
      expect.objectContaining({
        walletId: "wallet-buyer",
        bucket: "USER_SETTLEMENT",
        currency: "RON",
      }),
    );
    expect(createArgs.data.balanceChanges.create.amountDelta.toString()).toBe(
      "-300",
    );
    expect(tx.walletBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          walletId_bucket_currency: {
            walletId: "wallet-buyer",
            bucket: "USER_SETTLEMENT",
            currency: "RON",
          },
        },
      }),
    );
  });

  it("refuses to sell a scooter that already has a sale record, even a cancelled one", async () => {
    const tx = buildTx({
      scooterSale: {
        findUnique: jest.fn().mockResolvedValue({ status: "CANCELLED" }),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    await expect(
      service.createSale(
        {
          scooterId: "scooter-1",
          buyerCounterpartyId: "counterparty-buyer",
          saleAmount: "300.00",
          currency: "RON",
          soldOn: "2026-01-10",
          notes: null,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.scooterSale.create).not.toHaveBeenCalled();
  });

  it("refuses a buyer that is not an active person counterparty", async () => {
    const tx = buildTx({
      counterparty: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    await expect(
      service.createSale(
        {
          scooterId: "scooter-1",
          buyerCounterpartyId: "counterparty-company",
          saleAmount: "300.00",
          currency: "RON",
          soldOn: "2026-01-10",
          notes: null,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ScooterSalesService.recordPayment", () => {
  it("marks the sale PARTIALLY_PAID and rebuilds paidAmount from the posting", async () => {
    const current = fakeSale({
      saleAmount: new Prisma.Decimal("300.00"),
      paidAmount: new Prisma.Decimal("0.00"),
      status: "OPEN",
    });
    const updated = fakeSale({
      paidAmount: new Prisma.Decimal("100.00"),
      paidBusinessAmount: new Prisma.Decimal("100.00"),
      status: "PARTIALLY_PAID",
    });
    const tx = buildTx({
      scooterSale: {
        findUnique: jest.fn().mockResolvedValue(current),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(updated),
      },
      wallet: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "wallet-company" })
          .mockResolvedValueOnce({ id: "wallet-buyer" }),
      },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    const result = await service.recordPayment(
      "sale-1",
      {
        businessAmount: "100.00",
        personalAmount: "0.00",
        paidOn: "2026-01-15",
        paymentMethod: "BANK_TRANSFER",
        companyWalletId: "wallet-company",
        idempotencyKey: "payment-1",
        notes: null,
      },
      ACTOR,
    );

    expect(result.status).toBe("PARTIALLY_PAID");
    expect(result.paidAmount).toBe("100.00");
    expect(tx.scooterSale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PARTIALLY_PAID",
        }),
      }),
    );
    expect(tx.walletBalance.upsert).toHaveBeenCalledTimes(2);
    expect(tx.businessOwner.findFirst).not.toHaveBeenCalled();
  });

  it("splits a payment between the company wallet and a personal owner", async () => {
    const current = fakeSale({
      saleAmount: new Prisma.Decimal("300.00"),
      paidAmount: new Prisma.Decimal("0.00"),
      status: "OPEN",
    });
    const updated = fakeSale({
      paidAmount: new Prisma.Decimal("100.00"),
      paidBusinessAmount: new Prisma.Decimal("60.00"),
      paidPersonalAmount: new Prisma.Decimal("40.00"),
      status: "PARTIALLY_PAID",
    });
    const tx = buildTx({
      scooterSale: {
        findUnique: jest.fn().mockResolvedValue(current),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(updated),
      },
      wallet: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "wallet-company" })
          .mockResolvedValueOnce({ id: "wallet-buyer" })
          .mockResolvedValueOnce({ id: "wallet-owner" }),
      },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    const result = await service.recordPayment(
      "sale-1",
      {
        businessAmount: "60.00",
        personalAmount: "40.00",
        personalOwnerUserId: "user-owner",
        paidOn: "2026-01-15",
        paymentMethod: "BANK_TRANSFER",
        companyWalletId: "wallet-company",
        idempotencyKey: "payment-split",
        notes: null,
      },
      ACTOR,
    );

    expect(result.status).toBe("PARTIALLY_PAID");
    expect(tx.businessOwner.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-owner" }),
      }),
    );
    const [[createArgs]] = tx.moneyTransaction.create.mock.calls;
    expect(createArgs.data.recipientUserId).toBe("user-owner");
    const changes = createArgs.data.balanceChanges.create;
    expect(changes).toHaveLength(3);
    expect(changes[0]).toEqual(
      expect.objectContaining({
        walletId: "wallet-company",
        bucket: "BUSINESS_FUNDS",
      }),
    );
    expect(changes[0].amountDelta.toString()).toBe("60");
    expect(changes[1]).toEqual(
      expect.objectContaining({
        walletId: "wallet-owner",
        bucket: "ADMIN_PERSONAL_FUNDS",
      }),
    );
    expect(changes[1].amountDelta.toString()).toBe("40");
    expect(changes[2]).toEqual(
      expect.objectContaining({
        walletId: "wallet-buyer",
        bucket: "USER_SETTLEMENT",
      }),
    );
    expect(changes[2].amountDelta.toString()).toBe("100");
    expect(tx.walletBalance.upsert).toHaveBeenCalledTimes(3);
  });

  it("rejects a personal split to a user who is not an active business owner", async () => {
    const current = fakeSale({
      saleAmount: new Prisma.Decimal("300.00"),
      paidAmount: new Prisma.Decimal("0.00"),
      status: "OPEN",
    });
    const tx = buildTx({
      scooterSale: {
        findUnique: jest.fn().mockResolvedValue(current),
        create: jest.fn(),
        update: jest.fn(),
      },
      businessOwner: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    await expect(
      service.recordPayment(
        "sale-1",
        {
          businessAmount: "0.00",
          personalAmount: "40.00",
          personalOwnerUserId: "user-not-owner",
          paidOn: "2026-01-15",
          paymentMethod: "BANK_TRANSFER",
          idempotencyKey: "payment-bad-owner",
          notes: null,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.scooterSale.update).not.toHaveBeenCalled();
  });

  it("rejects a payment that would exceed the outstanding balance", async () => {
    const current = fakeSale({
      saleAmount: new Prisma.Decimal("300.00"),
      paidAmount: new Prisma.Decimal("250.00"),
      status: "PARTIALLY_PAID",
    });
    const tx = buildTx({
      scooterSale: {
        findUnique: jest.fn().mockResolvedValue(current),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    await expect(
      service.recordPayment(
        "sale-1",
        {
          businessAmount: "100.00",
          personalAmount: "0.00",
          paidOn: "2026-01-15",
          paymentMethod: "BANK_TRANSFER",
          companyWalletId: "wallet-company",
          idempotencyKey: "payment-2",
          notes: null,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.scooterSale.update).not.toHaveBeenCalled();
  });

  it("marks the sale PAID once the outstanding balance is fully paid", async () => {
    const current = fakeSale({
      saleAmount: new Prisma.Decimal("300.00"),
      paidAmount: new Prisma.Decimal("200.00"),
      status: "PARTIALLY_PAID",
    });
    const updated = fakeSale({
      paidAmount: new Prisma.Decimal("300.00"),
      status: "PAID",
    });
    const tx = buildTx({
      scooterSale: {
        findUnique: jest.fn().mockResolvedValue(current),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(updated),
      },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    const result = await service.recordPayment(
      "sale-1",
      {
        businessAmount: "100.00",
        personalAmount: "0.00",
        paidOn: "2026-01-20",
        paymentMethod: "CASH",
        companyWalletId: "wallet-company",
        idempotencyKey: "payment-3",
        notes: null,
      },
      ACTOR,
    );

    expect(result.status).toBe("PAID");
    expect(tx.scooterSale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
  });

  it("rejects recording a payment against a cancelled sale", async () => {
    const current = fakeSale({ status: "CANCELLED" });
    const tx = buildTx({
      scooterSale: {
        findUnique: jest.fn().mockResolvedValue(current),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const prisma = buildPrisma(tx);
    const service = new ScooterSalesService(prisma);

    await expect(
      service.recordPayment(
        "sale-1",
        {
          businessAmount: "50.00",
          personalAmount: "0.00",
          paidOn: "2026-01-20",
          paymentMethod: "CASH",
          companyWalletId: "wallet-company",
          idempotencyKey: "payment-4",
          notes: null,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ScooterSalesService.getScooterFinancials", () => {
  it("groups allocated costs by category and currency, ignoring non-posted expenses", async () => {
    const prisma = {
      scooter: { findUnique: jest.fn().mockResolvedValue({ id: "scooter-1" }) },
      expenseScooterAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            allocatedGrossAmount: new Prisma.Decimal("210.00"),
            expense: {
              currency: "RON",
              categoryId: "cat-purchase",
              category: { name: "Purchase" },
            },
          },
          {
            allocatedGrossAmount: new Prisma.Decimal("70.00"),
            expense: {
              currency: "RON",
              categoryId: "cat-transport",
              category: { name: "Transport" },
            },
          },
          {
            allocatedGrossAmount: new Prisma.Decimal("35.00"),
            expense: { currency: "RON", categoryId: null, category: null },
          },
        ]),
      },
      scooterSale: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ScooterSalesService(prisma);

    const result = await service.getScooterFinancials("scooter-1");

    expect(prisma.expenseScooterAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scooterId: "scooter-1", expense: { status: "POSTED" } },
      }),
    );
    expect(result.sale).toBeNull();
    expect(result.costBreakdown).toHaveLength(3);
    expect(result.totalCost).toEqual([{ currency: "RON", amount: "315.00" }]);
    const uncategorized = result.costBreakdown.find(
      (row) => row.categoryId === null,
    );
    expect(uncategorized?.totalAllocatedGrossAmount).toBe("35.00");
  });
});
