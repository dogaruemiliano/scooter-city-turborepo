/**
 * End-to-end check for `AuthCleanupService.runOnce()`. The cron schedule
 * itself is provided by `@nestjs/schedule` and trusted; what we verify is
 * the *query* — that each cutoff selects the right rows and leaves
 * fresher ones alone.
 *
 * Each scenario seeds an old + a fresh row of the same kind, calls
 * `runOnce()`, and asserts the old row is gone and the fresh one
 * survives.
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";

import { AppModule } from "../src/app.module";
import { AuthCleanupService } from "../src/auth/cleanup/auth-cleanup.service";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("AuthCleanupService (e2e)", () => {
  let app: INestApplication;
  let cleanup: AuthCleanupService;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    cleanup = app.get(AuthCleanupService);
    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    coreAuth = app.get(CoreAuthService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  async function freshUser() {
    const user = await users.createOne({
      email: `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    });
    createdUserIds.push(user.id);
    return user;
  }

  it("deletes refresh tokens whose expiresAt is in the past, keeps fresh ones", async () => {
    const user = await freshUser();
    const session = await coreAuth.issueSession({ user });

    const expiredJti = `expired-jti-${Date.now()}`;
    await prisma.refreshToken.create({
      data: {
        jti: expiredJti,
        sessionId: session.sessionId,
        userId: user.id,
        tokenHash: "deadbeef".repeat(8),
        expiresAt: new Date(Date.now() - ONE_DAY_MS),
      },
    });

    const before = await prisma.refreshToken.count({
      where: { userId: user.id },
    });

    const result = await cleanup.runOnce();
    expect(result.refreshTokensDeleted).toBeGreaterThanOrEqual(1);

    const expiredRow = await prisma.refreshToken.findUnique({
      where: { jti: expiredJti },
    });
    expect(expiredRow).toBeNull();

    // The session's own fresh refresh row still exists.
    const after = await prisma.refreshToken.count({
      where: { userId: user.id },
    });
    expect(after).toBe(before - 1);
  });

  it("deletes OTP challenges older than 7 days, keeps newer ones", async () => {
    const user = await freshUser();

    const oldChallenge = await prisma.otpChallenge.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        channel: "EMAIL",
        purpose: "AUTH",
        target: user.email,
        codeHash: "old".padEnd(64, "0"),
        expiresAt: new Date(Date.now() - 8 * ONE_DAY_MS), // 8 days ago
        nextSendAt: new Date(Date.now() - 8 * ONE_DAY_MS),
      },
    });
    const recentChallenge = await prisma.otpChallenge.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        channel: "EMAIL",
        purpose: "AUTH",
        target: user.email,
        codeHash: "new".padEnd(64, "0"),
        expiresAt: new Date(Date.now() - 1 * ONE_DAY_MS), // 1 day ago
        nextSendAt: new Date(Date.now() - ONE_DAY_MS),
      },
    });

    const result = await cleanup.runOnce();
    expect(result.otpChallengesDeleted).toBeGreaterThanOrEqual(1);

    expect(
      await prisma.otpChallenge.findUnique({
        where: { id: oldChallenge.id },
      }),
    ).toBeNull();
    expect(
      await prisma.otpChallenge.findUnique({
        where: { id: recentChallenge.id },
      }),
    ).not.toBeNull();

    await prisma.otpChallenge.delete({
      where: { id: recentChallenge.id },
    });
  });

  it("deletes expired OTP delivery quota windows and keeps active ones", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expired = await prisma.otpDeliveryQuota.create({
      data: {
        bucket: "TARGET_HOUR",
        subjectHash: `expired-${suffix}`,
        windowStart: new Date(Date.now() - 2 * ONE_DAY_MS),
        windowEnd: new Date(Date.now() - ONE_DAY_MS),
        count: 1,
      },
    });
    const active = await prisma.otpDeliveryQuota.create({
      data: {
        bucket: "TARGET_HOUR",
        subjectHash: `active-${suffix}`,
        windowStart: new Date(),
        windowEnd: new Date(Date.now() + ONE_DAY_MS),
        count: 1,
      },
    });

    const result = await cleanup.runOnce();
    expect(result.otpDeliveryQuotasDeleted).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.otpDeliveryQuota.findUnique({
        where: {
          bucket_subjectHash_windowStart: {
            bucket: expired.bucket,
            subjectHash: expired.subjectHash,
            windowStart: expired.windowStart,
          },
        },
      }),
    ).toBeNull();
    expect(
      await prisma.otpDeliveryQuota.findUnique({
        where: {
          bucket_subjectHash_windowStart: {
            bucket: active.bucket,
            subjectHash: active.subjectHash,
            windowStart: active.windowStart,
          },
        },
      }),
    ).not.toBeNull();

    await prisma.otpDeliveryQuota.delete({
      where: {
        bucket_subjectHash_windowStart: {
          bucket: active.bucket,
          subjectHash: active.subjectHash,
          windowStart: active.windowStart,
        },
      },
    });
  });

  it("deletes sessions revoked more than 30 days ago, keeps recent revocations", async () => {
    const user = await freshUser();

    const oldSession = await prisma.session.create({
      data: {
        userId: user.id,
        revokedAt: new Date(Date.now() - 31 * ONE_DAY_MS),
      },
    });
    const recentSession = await prisma.session.create({
      data: {
        userId: user.id,
        revokedAt: new Date(Date.now() - 5 * ONE_DAY_MS),
      },
    });

    const result = await cleanup.runOnce();
    expect(result.sessionsDeleted).toBeGreaterThanOrEqual(1);

    expect(
      await prisma.session.findUnique({ where: { id: oldSession.id } }),
    ).toBeNull();
    expect(
      await prisma.session.findUnique({ where: { id: recentSession.id } }),
    ).not.toBeNull();
  });

  it("is idempotent: running twice in a row leaves nothing to delete the second time", async () => {
    // First pass cleans anything left from earlier tests.
    await cleanup.runOnce();
    const second = await cleanup.runOnce();
    expect(second.refreshTokensDeleted).toBe(0);
    expect(second.otpChallengesDeleted).toBe(0);
    expect(second.otpDeliveryQuotasDeleted).toBe(0);
    expect(second.sessionsDeleted).toBe(0);
  });
});
