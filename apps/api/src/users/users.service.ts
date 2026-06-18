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
    return this.prisma.user.create({ data });
  }

  updateProfile(
    id: string,
    data: Pick<Prisma.UserUpdateInput, "firstName" | "lastName">,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /**
   * Hard-deletes the user and cascades every dependent row (Session,
   * RefreshToken, OtpChallenge, AuthAccount) — see the schema's `onDelete`
   * rules in [docs/auth/sessions-and-audit.md](../../../../docs/auth/sessions-and-audit.md).
   *
   * `AuditEvent` rows survive with `userId = NULL` (SetNull on FK).
   */
  deleteOne(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
