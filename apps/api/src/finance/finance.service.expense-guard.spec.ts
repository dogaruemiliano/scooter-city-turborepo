import { ConflictException } from "@nestjs/common";

import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { FinanceService } from "./finance.service";

describe("FinanceService expense lifecycle guard", () => {
  it("refuses generic reversal of every expense-generated ledger row", async () => {
    const transactionFindUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ledger-1", status: "POSTED" });
    const tx = {
      moneyTransaction: { findUnique: transactionFindUnique },
      expensePosting: {
        findUnique: jest.fn().mockResolvedValue({
          expenseId: "expense-1",
          role: "REIMBURSEMENT_SETTLEMENT",
        }),
      },
    };
    const prisma = {
      moneyTransaction: { findUnique: transactionFindUnique },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    } as unknown as PrismaService;
    const service = new FinanceService(prisma, {} as AuditService);

    await expect(
      service.reverseTransaction("ledger-1", { idempotencyKey: "reverse-1" }, {
        actor: { id: "admin-1" },
        ip: null,
        userAgent: null,
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.expensePosting.findUnique).toHaveBeenCalledWith({
      where: { moneyTransactionId: "ledger-1" },
      select: { expenseId: true, role: true },
    });
  });
});

describe("FinanceService operating-company activity", () => {
  it("filters income and expenses through wallets assigned to the legal entity", async () => {
    const count = jest.fn();
    const findMany = jest.fn();
    const prisma = {
      moneyTransaction: { count, findMany },
      $transaction: jest.fn().mockResolvedValue([0, []]),
    } as unknown as PrismaService;
    const service = new FinanceService(prisma, {} as AuditService);

    await service.listTransactions({
      page: 1,
      pageSize: 25,
      types: ["INCOME", "EXPENSE"],
      businessLegalEntityId: "legal-entity-jusem",
    });

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        type: { in: ["INCOME", "EXPENSE"] },
        AND: [
          {
            balanceChanges: {
              some: {
                wallet: {
                  businessLegalEntities: {
                    some: { legalEntityId: "legal-entity-jusem" },
                  },
                },
              },
            },
          },
        ],
      }),
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ["INCOME", "EXPENSE"] },
        }),
      }),
    );
  });
});
