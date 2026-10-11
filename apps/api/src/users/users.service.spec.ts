import { ConflictException } from "@nestjs/common";

import type { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { UsersService } from "./users.service";

describe("Account deactivation admission safety", () => {
  function setup(isSuperAdmin: boolean, remainingAdmins = 0) {
    const user = {
      id: "actor",
      email: "actor@example.com",
      deletedAt: null,
      loginStatus: "ACTIVE",
      isSuperAdmin,
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(user),
        count: jest.fn().mockResolvedValue(remainingAdmins),
        update: jest.fn().mockResolvedValue({
          ...user,
          deletedAt: new Date(),
          loginStatus: "DISABLED",
        }),
      },
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      session: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      otpChallenge: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      authAccount: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      userInvitation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: (
        action: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => action(tx as unknown as Prisma.TransactionClient),
    } as unknown as PrismaService;
    return { service: new UsersService(prisma), tx };
  }

  it("rejects removal of the last active super admin before removing any credentials", async () => {
    const { service, tx } = setup(true);
    await expect(service.deactivateAccount("actor")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it("permits deactivation when another active super admin remains", async () => {
    const { service, tx } = setup(true, 1);
    await expect(service.deactivateAccount("actor")).resolves.toMatchObject({
      loginStatus: "DISABLED",
    });
    expect(tx.session.deleteMany).toHaveBeenCalled();
    expect(tx.userInvitation.updateMany).toHaveBeenCalled();
    expect(tx.auditEvent.create).toHaveBeenCalled();
  });

  it("deactivates ordinary users without requiring a remaining super admin", async () => {
    const { service, tx } = setup(false);
    await expect(service.deactivateAccount("actor")).resolves.toMatchObject({
      loginStatus: "DISABLED",
    });
    expect(tx.user.count).not.toHaveBeenCalled();
    expect(tx.otpChallenge.deleteMany).toHaveBeenCalled();
  });
});
