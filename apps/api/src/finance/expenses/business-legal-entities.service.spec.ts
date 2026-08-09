import { ConflictException } from "@nestjs/common";

import type { PrismaService } from "../../prisma/prisma.service";
import { BusinessLegalEntitiesService } from "./business-legal-entities.service";

describe("BusinessLegalEntitiesService wallet history", () => {
  it("does not remove a wallet referenced by an expense settlement", async () => {
    const tx = {
      businessLegalEntity: {
        findUnique: jest.fn().mockResolvedValue({ id: "entity-1" }),
      },
      wallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "wallet-retained",
            type: "COMPANY_BANK",
            isActive: true,
            businessLegalEntities: [{ legalEntityId: "entity-1" }],
          },
        ]),
      },
      expensePayment: { findFirst: jest.fn().mockResolvedValue(null) },
      expenseReimbursementSettlement: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ companyWalletId: "wallet-removed" }),
      },
      businessLegalEntityWallet: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        Promise.resolve(operation(tx)),
      ),
    } as unknown as PrismaService;
    const service = new BusinessLegalEntitiesService(prisma);

    await expect(
      service.update("entity-1", { walletIds: ["wallet-retained"] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.businessLegalEntityWallet.deleteMany).not.toHaveBeenCalled();
  });
});
