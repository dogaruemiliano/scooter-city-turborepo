import { v1 } from "@repo/api-shared";
import { ConflictException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

/** Closed reports never keep a scooter out of service, including legacy retained holds. */
export const activeMaintenanceHoldWhere = {
  blocksUsage: true,
  status: { in: ["open", "in_progress"] },
} satisfies Prisma.ScooterProblemWhereInput;

/** Caller must hold the scooter row lock before checking or changing availability. */
export async function assertScooterNotOnHold(
  tx: Prisma.TransactionClient,
  scooterId: string,
) {
  const blocker = await tx.scooterProblem.findFirst({
    where: { scooterId, ...activeMaintenanceHoldWhere },
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
