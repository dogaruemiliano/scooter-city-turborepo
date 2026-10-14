import { v1 } from "@repo/api-shared";
import { ConflictException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

/** Caller must hold the scooter row lock before checking or changing availability. */
export async function assertScooterNotOnHold(
  tx: Prisma.TransactionClient,
  scooterId: string,
) {
  const blocker = await tx.scooterProblem.findFirst({
    where: { scooterId, blocksUsage: true },
    select: { id: true },
  });
  if (blocker)
    throw new ConflictException({
      code: v1.problems.MAINTENANCE_HOLD_ERROR_CODE,
      message:
        "Scooter has a maintenance hold. Clear every blocking problem before rental creation or handover.",
      details: { scooterId },
    });
}
