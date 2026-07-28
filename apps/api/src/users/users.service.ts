/**
 * Thin data-access wrapper around the `User` table.
 *
 * Inputs use Prisma's generated `Prisma.UserCreateInput` rather than a
 * hand-rolled interface — the schema is the source of truth and the
 * generated type can't drift. The auth modules in PR 5+ define their
 * own NestJS DTOs (class-validator + `@ApiProperty` decorators for
 * Swagger / Orval) and translate the DTO to this input shape before
 * calling `createOne`.
 *
 * Callers MUST NOT expect this service to normalize inputs (lowercasing
 * emails, formatting phone numbers). Normalization happens at the
 * controller boundary so two callers passing slightly different casing
 * can't race-create duplicate rows.
 *
 * No HTTP controller is exposed here — this service is internal-only.
 * Authorization (who can call which method on whose row) lives in the
 * auth controllers that use this service. The template defers any
 * role/permission layer to a future session.
 */
import { Injectable } from "@nestjs/common";

// `Prisma` namespace lives in `client` (the runtime file). The pure-type
// barrel at `models` doesn't re-export the namespace.
import type { Prisma, User } from "../generated/prisma/client";
import { userWalletCreateInput } from "../finance/user-wallet";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns `null` when no row matches. Callers must not assume `!`. */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findAccountProfileById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        authAccounts: {
          select: { provider: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  createOne(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        ...data,
        wallet: data.wallet ?? userWalletCreateInput(),
      },
    });
  }

  updateProfile(
    id: string,
    data: Pick<Prisma.UserUpdateInput, "firstName" | "lastName">,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /**
   * Deactivates an account without deleting its business identity or history.
   *
   * Setting `deletedAt` and removing every authentication credential happen in
   * one transaction: callers never observe a deleted account that can still
   * refresh a session. Pending OTP challenges for the account email are also
   * removed so an already-delivered code cannot be reused after deactivation.
   *
   * `Person`, wallet, rentals, financial transactions, and audit events remain
   * linked to the preserved `User` row. Personal-data anonymization is a
   * separate retention workflow and is intentionally not performed here.
   */
  deactivateAccount(id: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      const deactivated = await tx.user.update({
        where: { id },
        data: { deletedAt: user.deletedAt ?? new Date() },
      });

      // RefreshToken also cascades from Session, but deleting it explicitly
      // makes the credential-removal contract clear and keeps the order safe.
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.otpChallenge.deleteMany({
        where: {
          OR: [{ userId: id }, { target: user.email }],
        },
      });
      await tx.authAccount.deleteMany({ where: { userId: id } });

      return deactivated;
    });
  }
}
