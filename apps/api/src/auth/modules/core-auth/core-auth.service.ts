/**
 * The core auth service — session lifecycle + refresh-token rotation.
 *
 * Three load-bearing operations:
 *
 * 1. `issueSession` — called by each auth-method module after it
 *    authenticates a user. Creates a fresh
 *    `Session` row + first refresh-token row, mints the access+refresh
 *    JWT pair, and returns them to the caller. The caller drops them
 *    into cookies via [`setAuthCookies`](../../utils/cookies.ts).
 *
 * 2. `rotateTokens` — called by `POST /v1/auth/refresh`. Verifies the
 *    presented refresh token, swaps it for a new pair, and returns the
 *    new pair. The full algorithm — including the multi-instance-safe
 *    grace window and reuse-detection burn — is documented in
 *    [docs/auth/refresh-rotation.md](../../../../../docs/auth/refresh-rotation.md).
 *    Read that doc before changing this method.
 *
 * 3. `revokeSession` / `revokeAllUserSessions` / `burnSession` — write
 *    `revokedAt` on `Session` and the associated `RefreshToken` rows.
 *    The cleanup job eventually hard-deletes old revoked rows.
 *
 * Pure crypto / JWT-minting helpers live in
 * [`../../utils/token-mint.ts`](../../utils/token-mint.ts).
 */
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";

import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { Prisma } from "../../../generated/prisma/client";
import type {
  RefreshToken,
  Session,
  User,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { hashRefreshToken, safeEqualHex } from "../../utils/hash";
import type { KeyRing } from "../../utils/keys";
import { KEY_RING } from "../../utils/keys.module";
import { mintAccessToken, mintRefreshToken } from "../../utils/token-mint";

import type {
  IssueSessionInput,
  IssueSessionResult,
  TokenPair,
} from "./core-auth.types";

interface RefreshJwtPayload {
  tokenType: "refresh";
  sub: string;
  sid: string;
  jti: string;
}

type LockedRefreshTokenRow = Pick<
  RefreshToken,
  "jti" | "sessionId" | "userId" | "tokenHash" | "createdAt" | "revokedAt"
>;

const MS_PER_SEC = 1000;

@Injectable()
export class CoreAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
    @Inject(KEY_RING) private readonly ring: KeyRing,
  ) {}

  /**
   * Mints a fresh session + token pair for a just-authenticated user.
   * Called by every auth-method module once it has identified the user.
   */
  async issueSession(input: IssueSessionInput): Promise<IssueSessionResult> {
    return this.prisma.$transaction((tx) =>
      this.issueSessionInTransaction(tx, input),
    );
  }

  /**
   * Transaction-aware session issuer for authentication flows that must
   * atomically claim a challenge, resolve a user, and create the session.
   */
  async issueSessionInTransaction(
    tx: Prisma.TransactionClient,
    input: IssueSessionInput,
  ): Promise<IssueSessionResult> {
    const session = await tx.session.create({
      data: {
        userId: input.user.id,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
      },
    });

    const pair = await this.mintAndPersistPair(tx, {
      user: input.user,
      sessionId: session.id,
    });

    return { ...pair, sessionId: session.id };
  }

  /**
   * Verify, rotate, and return a new pair. See file-level comment for
   * the algorithm doc pointer.
   *
   * Throws `UnauthorizedException` on:
   * - invalid / expired JWT signature
   * - unknown jti (token never existed or has been hard-deleted)
   * - hash mismatch on the current row (defense in depth: the JWT
   *   signature already vouches for the value)
   * - revoked row outside the grace window (reuse-after-grace — also
   *   triggers a full session burn before throwing)
   */
  async rotateTokens(presentedRefreshToken: string): Promise<TokenPair> {
    const payload = this.verifyRefreshJwt(presentedRefreshToken);
    const presentedHash = hashRefreshToken(
      presentedRefreshToken,
      this.env.REFRESH_TOKEN_HMAC_SECRET,
    );

    // The transaction commits with a discriminated result; we then act
    // on the result outside the transaction. Throwing INSIDE the
    // transaction would roll back any burn-writes we did along the way,
    // which is the opposite of what we want for reuse-detection.
    const result = await this.prisma.$transaction(async (tx) => {
      // Acquire the row-level lock on the presented jti. Concurrent
      // rotations of the same token block here; concurrent rotations of
      // *different* tokens proceed in parallel.
      const locked = await tx.$queryRaw<LockedRefreshTokenRow[]>`
        SELECT
          "jti",
          "sessionId",
          "userId",
          "tokenHash",
          "createdAt",
          "revokedAt"
        FROM "RefreshToken"
        WHERE "jti" = ${payload.jti}
        FOR UPDATE
      `;
      const row = locked[0];

      if (!row) {
        return { kind: "invalid" as const };
      }
      if (row.sessionId !== payload.sid || row.userId !== payload.sub) {
        return { kind: "invalid" as const };
      }
      const activeSession = await tx.session.findFirst({
        where: {
          id: row.sessionId,
          userId: row.userId,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (!activeSession) {
        return { kind: "invalid" as const };
      }

      // ─── Case A: row is still active → standard rotation ────────────
      if (row.revokedAt === null) {
        if (!safeEqualHex(row.tokenHash, presentedHash)) {
          return { kind: "burn" as const, sessionId: row.sessionId };
        }
        const pair = await this.rotateFromRow(tx, row);
        return { kind: "ok" as const, pair };
      }

      // ─── Case B: row is revoked → grace replay or reuse ─────────────
      //
      // Walk the chain forward looking for the youngest non-revoked
      // descendant within the grace window. Without this walk, N
      // concurrent rotations of the same token would only succeed for
      // the first two — the third would see a revoked-successor and
      // burn the session. With the walk, N concurrent rotations all
      // chain cleanly until grace expires.
      const graceMs = this.env.ROTATION_GRACE_SECONDS * MS_PER_SEC;
      const graceCutoff = Date.now() - graceMs;
      const target = await this.findLiveDescendantInGrace(
        tx,
        row.jti,
        graceCutoff,
      );

      if (target) {
        const pair = await this.rotateFromRow(tx, target);
        return { kind: "ok" as const, pair };
      }

      return { kind: "burn" as const, sessionId: row.sessionId };
    });

    switch (result.kind) {
      case "invalid":
        throw new UnauthorizedException("Invalid refresh token");
      case "burn":
        // Burn the session in a second, smaller transaction. Has to be
        // after the rotation transaction commits so its writes survive.
        await this.burnSessionExternal(result.sessionId);
        throw new UnauthorizedException(
          "Refresh token reuse detected; session revoked",
        );
      case "ok":
        return result.pair;
    }
  }

  /** Revoke a session only when it belongs to the given user. */
  async revokeUserSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });

    if (!session) return false;

    await this.revokeSession(sessionId, userId);
    return true;
  }

  /** Revoke a single session (and every refresh token under it). */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  /**
   * Revoke every active session of a user. Used by logout-all and
   * delete-me flows. Pass `exceptSessionId` to keep the current device
   * signed in (the "log out other devices" UX).
   *
   * Returns the count of sessions revoked.
   */
  async revokeAllUserSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const now = new Date();
    const sessionWhere: Prisma.SessionWhereInput = {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    };
    const tokenWhere: Prisma.RefreshTokenWhereInput = {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { sessionId: { not: exceptSessionId } } : {}),
    };

    const [sessionUpdate] = await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: sessionWhere,
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: tokenWhere,
        data: { revokedAt: now },
      }),
    ]);
    return sessionUpdate.count;
  }

  /** All active sessions for a user, most-recently-used first. */
  listSessions(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  /**
   * Constant-time compare against a discard hash. Use at the top of
   * every "user not found" path in auth services so the wall-clock
   * timing of "no such user" matches "user exists but wrong password".
   * Prevents email/phone enumeration via response timing.
   */
  async performDummyHashCompare(): Promise<void> {
    await bcrypt.compare(
      "dummy-value-no-user-found",
      "$2b$12$abcdefghijklmnopqrstuv0123456789ABCDEFGHIJKLMNOPQR.STUVW",
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────

  private verifyRefreshJwt(token: string): RefreshJwtPayload {
    try {
      // Multi-key verify: pick the public key by `header.kid` so tokens
      // signed with a recently-rotated key still verify during the
      // rotation window. Algorithms pinned to RS256 to close any
      // alg-confusion attack surface.
      const publicKey = this.ring.resolveVerifyKey(token);
      const payload = this.jwt.verify<RefreshJwtPayload>(token, {
        publicKey,
        algorithms: ["RS256"],
      });
      if (
        payload.tokenType !== "refresh" ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.jti !== "string"
      ) {
        throw new Error("invalid refresh claims");
      }
      return payload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  /**
   * Walk the `previousJti` chain forward from `startJti`, returning the
   * youngest non-revoked descendant created within the grace window —
   * or `null` if every descendant is revoked / out of grace.
   *
   * The walk is bounded by the chain depth, which equals the number of
   * concurrent rotations of the original token. Realistic upper bound
   * is "tabs in one browser" — single digits.
   */
  private async findLiveDescendantInGrace(
    tx: Prisma.TransactionClient,
    startJti: string,
    graceCutoffMs: number,
  ): Promise<LockedRefreshTokenRow | null> {
    const locked = await tx.$queryRaw<LockedRefreshTokenRow[]>`
      SELECT
        "jti",
        "sessionId",
        "userId",
        "tokenHash",
        "createdAt",
        "revokedAt"
      FROM "RefreshToken"
      WHERE "previousJti" = ${startJti}
      FOR UPDATE
    `;
    const next = locked[0] ?? null;
    if (next === null) return null;
    if (next.createdAt.getTime() < graceCutoffMs) return null;
    if (next.revokedAt === null) return next;
    return this.findLiveDescendantInGrace(tx, next.jti, graceCutoffMs);
  }

  /**
   * Standard rotation step driven by an already-locked previous row:
   * fetch user, mint new pair, revoke previous, bump session
   * `lastUsedAt`. Used from both Case A (normal) and Case B (grace).
   */
  private async rotateFromRow(
    tx: Prisma.TransactionClient,
    previousRow: LockedRefreshTokenRow,
  ): Promise<TokenPair> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: previousRow.userId },
      select: { id: true, email: true, roles: true },
    });

    const pair = await this.mintAndPersistPair(tx, {
      user,
      sessionId: previousRow.sessionId,
      previousJti: previousRow.jti,
    });

    const now = new Date();
    await tx.refreshToken.update({
      where: { jti: previousRow.jti },
      data: { revokedAt: now },
    });
    await tx.session.update({
      where: { id: previousRow.sessionId },
      data: { lastUsedAt: now },
    });

    return pair;
  }

  /**
   * Mints a fresh access+refresh pair AND persists the new
   * `RefreshToken` row inside the supplied transaction. The caller is
   * responsible for revoking the previous row (if any) within the same
   * transaction.
   */
  private async mintAndPersistPair(
    tx: Prisma.TransactionClient,
    opts: {
      user: Pick<User, "id" | "email" | "roles">;
      sessionId: string;
      previousJti?: string;
    },
  ): Promise<TokenPair> {
    const access = mintAccessToken(
      this.jwt,
      {
        sub: opts.user.id,
        email: opts.user.email,
        sid: opts.sessionId,
        roles: opts.user.roles,
      },
      this.env.JWT_ACCESS_TTL,
    );

    const refresh = mintRefreshToken(
      this.jwt,
      { sub: opts.user.id, sid: opts.sessionId },
      this.env.JWT_REFRESH_TTL,
    );

    await tx.refreshToken.create({
      data: {
        jti: refresh.jti,
        previousJti: opts.previousJti ?? null,
        sessionId: opts.sessionId,
        userId: opts.user.id,
        tokenHash: hashRefreshToken(
          refresh.token,
          this.env.REFRESH_TOKEN_HMAC_SECRET,
        ),
        expiresAt: new Date(refresh.expSec * MS_PER_SEC),
      },
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessTokenExpiresInSec: access.expSec - access.iatSec,
      refreshTokenExpiresInSec: refresh.expSec - refresh.iatSec,
    };
  }

  /**
   * Reuse-detection / explicit-burn helper. Revokes every active
   * refresh-token row under a session AND marks the session itself as
   * revoked. Runs in its OWN transaction — the rotation transaction
   * commits first (preserving any walk-forward writes); then this burn
   * runs; then `rotateTokens` throws.
   *
   * Audit emission happens in the calling controller, not here — keeps
   * the service free of cross-cutting side effects.
   */
  private async burnSessionExternal(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}
