/**
 * Append-only audit log writer.
 *
 * Persists one `AuditEvent` row per call. Failures are logged but NOT
 * thrown — losing an audit event must never break the user-facing flow
 * that called it. (If you want hard-fail semantics for a specific event,
 * wrap the call in your own try/catch.)
 *
 * `userId` is nullable. Some events have no logged-in subject yet
 * (anti-enum signup attempts, OAuth verification fails before a user is
 * matched). The schema allows `null` and cascades to `SetNull` on user
 * deletion so historical events survive account removal — see
 * [docs/auth/sessions-and-audit.md](../../../../docs/auth/sessions-and-audit.md).
 */
import { Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

// `Prisma` (namespace + runtime helpers like `JsonNull`) lives in `client`.
// The pure-type re-export at `../generated/prisma/models` only exposes
// types — not the runtime `JsonNull` sentinel we need to clear a Json column.
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

import type { AuditEventType } from "./audit.types";

export interface RecordAuditInput {
  type: AuditEventType;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Optional metadata. Stored as `jsonb`. Pass a plain JSON-serializable
   * value; omit (or pass `null`) to leave the column as SQL `NULL`.
   */
  meta?: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          type: input.type,
          userId: input.userId ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          // `Prisma.JsonNull` writes JSON-null into the column; the JS
          // `null` literal would mean "don't set this field" instead.
          meta: input.meta ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      this.logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          auditType: input.type,
          userId: input.userId,
        },
        "AuditService.record failed",
      );
    }
  }
}
