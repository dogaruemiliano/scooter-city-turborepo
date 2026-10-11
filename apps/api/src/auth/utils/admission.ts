import { UnauthorizedException } from "@nestjs/common";

import { Prisma, type User } from "../../generated/prisma/client";

type AdmissionClient = Pick<
  Prisma.TransactionClient,
  "user" | "userInvitation"
>;

/** Shared with access administration and the last-super-admin safeguard. */
export async function lockAccessLifecycle(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(726001)`;
}

/** Prisma 7 driver adapters wrap raw PostgreSQL serialization failures. */
export function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const driverError = error.meta?.driverAdapterError as
    | { cause?: { originalCode?: string } }
    | undefined;
  return (
    error.meta?.code === "40001" || driverError?.cause?.originalCode === "40001"
  );
}

/** A business identity alone never authorizes login. */
export async function isLoginEligible(
  db: AdmissionClient,
  user: Pick<User, "id" | "email" | "deletedAt" | "loginStatus"> | null,
  now = new Date(),
): Promise<boolean> {
  if (!user || user.deletedAt !== null) return false;
  if (user.loginStatus === "ACTIVE") return true;
  if (user.loginStatus !== "INVITED") return false;
  return (
    (await db.userInvitation.findFirst({
      where: {
        userId: user.id,
        email: user.email,
        activatedAt: null,
        cancelledAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    })) !== null
  );
}

export async function requireLoginEligible(
  db: AdmissionClient,
  user: Pick<User, "id" | "email" | "deletedAt" | "loginStatus"> | null,
) {
  if (!(await isLoginEligible(db, user))) {
    throw new UnauthorizedException("Account is unavailable");
  }
}
