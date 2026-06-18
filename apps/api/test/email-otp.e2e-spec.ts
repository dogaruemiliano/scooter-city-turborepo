process.env.OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR = "10000";
process.env.OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY = "10000";
process.env.OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR = "10000";
process.env.THROTTLE_GLOBAL_PER_IP_PER_MIN = "10000";
process.env.THROTTLE_OTP_REQUESTS_PER_IP_PER_MIN = "20";
process.env.THROTTLE_LOGIN_PER_IP_PER_MIN = "10000";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { AuditEventType } from "../src/audit/audit.types";
import { hashOtp } from "../src/auth/utils/hash";
import { MailerService } from "../src/mailer/mailer.service";
import { SpyMailerService } from "../src/mailer/impls/spy-mailer.service";
import type { MailerMessage } from "../src/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

const DEV_OTP = "000000";

describe("EmailOtpController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let mailer: SpyMailerService;

  const createdUserIds: string[] = [];
  const createdChallengeIds: string[] = [];

  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useClass(SpyMailerService)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    mailer = app.get(MailerService);
  });

  afterAll(async () => {
    if (createdChallengeIds.length > 0) {
      await prisma.otpChallenge.deleteMany({
        where: { id: { in: createdChallengeIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.otpDeliveryQuota.deleteMany();
    await app.close();
  });

  afterEach(() => {
    mailer.reset();
  });

  async function freshUser(opts: { emailVerified?: Date | null } = {}) {
    const email = uniqueEmail("existing");
    const user = await users.createOne({
      email,
      ...(opts.emailVerified !== undefined
        ? { emailVerified: opts.emailVerified }
        : {}),
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function requestChallenge(
    email: string,
  ): Promise<v1.auth.OtpChallengeMetadata> {
    const response = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(response.status).toBe(202);
    const challenge = v1.auth.otpChallengeMetadataSchema.parse(response.body);
    expect(challenge).toMatchObject({
      status: "verification_required",
      challengeId: expect.any(String) as string,
      expiresInSec: expect.any(Number) as number,
      resendAfterSec: expect.any(Number) as number,
    });
    createdChallengeIds.push(challenge.challengeId);
    return challenge;
  }

  it("returns identical challenge shapes for existing and new emails without creating the new user", async () => {
    const existing = await freshUser({ emailVerified: new Date() });
    const unknownEmail = uniqueEmail("new");

    const existingChallenge = await requestChallenge(existing.email);
    const unknownChallenge = await requestChallenge(unknownEmail);

    expect(Object.keys(existingChallenge).sort()).toEqual(
      Object.keys(unknownChallenge).sort(),
    );
    expect(
      await prisma.user.findUnique({ where: { email: unknownEmail } }),
    ).toBeNull();
    expect(
      await prisma.otpChallenge.findUnique({
        where: { id: unknownChallenge.challengeId },
      }),
    ).toMatchObject({
      target: unknownEmail,
      purpose: "AUTH",
      channel: "EMAIL",
      userId: null,
      attemptsCount: 0,
      sentCount: 1,
      usedAt: null,
    });
    expect(mailer.findLastTo(existing.email)?.text).toContain(DEV_OTP);
    expect(mailer.findLastTo(unknownEmail)?.text).toContain(DEV_OTP);
  });

  it("verifies a new email, creates one user and session, and emits signup audits", async () => {
    const email = uniqueEmail("signup");
    const challenge = await requestChallenge(email);

    const response = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: challenge.challengeId, code: DEV_OTP });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: expect.any(String) as string,
      refreshToken: expect.any(String) as string,
    });
    const cookies = response.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    expect(cookies?.some((cookie) => cookie.startsWith("access_token="))).toBe(
      true,
    );
    expect(cookies?.some((cookie) => cookie.startsWith("refresh_token="))).toBe(
      true,
    );

    const user = await prisma.user.findUnique({
      where: { email },
      include: { sessions: true },
    });
    expect(user).not.toBeNull();
    if (!user) throw new Error("Expected email OTP signup to create a user");
    createdUserIds.push(user.id);
    expect(user.emailVerified).not.toBeNull();
    expect(user.sessions).toHaveLength(1);

    const challengeRow = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    });
    expect(challengeRow.usedAt).not.toBeNull();
    expect(challengeRow.activeKey).toBeNull();
    expect(challengeRow.userId).toBe(user.id);

    const auditTypes = (
      await prisma.auditEvent.findMany({ where: { userId: user.id } })
    ).map((row) => row.type);
    expect(auditTypes).toEqual(
      expect.arrayContaining([
        AuditEventType.SIGNUP,
        AuditEventType.EMAIL_VERIFIED,
        AuditEventType.LOGIN_SUCCESS,
      ]),
    );
  });

  it("verifies an existing unverified user without emitting SIGNUP", async () => {
    const user = await freshUser({ emailVerified: null });
    const challenge = await requestChallenge(user.email);

    const response = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: challenge.challengeId, code: DEV_OTP });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updated.emailVerified).not.toBeNull();

    const auditTypes = (
      await prisma.auditEvent.findMany({ where: { userId: user.id } })
    ).map((row) => row.type);
    expect(auditTypes).toContain(AuditEventType.EMAIL_VERIFIED);
    expect(auditTypes).toContain(AuditEventType.LOGIN_SUCCESS);
    expect(auditTypes).not.toContain(AuditEventType.SIGNUP);
  });

  it("reuses the challenge, keeps the same code, and applies 30s/2m/5m resend backoff", async () => {
    const email = uniqueEmail("resend");
    const challenge = await requestChallenge(email);
    const initialRow = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    });
    const initialExpiry = initialRow.expiresAt;
    const initialMessage = mailer.findLastTo(email)?.text;

    const early = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId: challenge.challengeId });
    expect(early.status).toBe(202);
    expect(
      v1.auth.otpChallengeMetadataSchema.parse(early.body).challengeId,
    ).toBe(challenge.challengeId);
    expect(mailer.getOutbox()).toHaveLength(1);

    await prisma.otpChallenge.update({
      where: { id: challenge.challengeId },
      data: {
        attemptsCount: 1,
        nextSendAt: new Date(Date.now() - 1),
      },
    });
    const first = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId: challenge.challengeId });
    expect(first.status).toBe(202);
    expect(
      v1.auth.otpChallengeMetadataSchema.parse(first.body).resendAfterSec,
    ).toBeGreaterThanOrEqual(119);

    let row = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    });
    expect(row.sentCount).toBe(2);
    expect(row.attemptsCount).toBe(1);
    expect(row.expiresAt).toEqual(initialExpiry);
    expect(mailer.findLastTo(email)?.text).toBe(initialMessage);

    await prisma.otpChallenge.update({
      where: { id: challenge.challengeId },
      data: { nextSendAt: new Date(Date.now() - 1) },
    });
    const second = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId: challenge.challengeId });
    expect(second.status).toBe(202);
    expect(
      v1.auth.otpChallengeMetadataSchema.parse(second.body).resendAfterSec,
    ).toBeGreaterThanOrEqual(299);

    await prisma.otpChallenge.update({
      where: { id: challenge.challengeId },
      data: { nextSendAt: new Date(Date.now() - 1) },
    });
    const third = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId: challenge.challengeId });
    expect(third.status).toBe(202);
    expect(
      v1.auth.otpChallengeMetadataSchema.parse(third.body).resendAfterSec,
    ).toBeGreaterThanOrEqual(299);

    row = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    });
    expect(row.sentCount).toBe(4);
    expect(row.attemptsCount).toBe(1);
    expect(row.expiresAt).toEqual(initialExpiry);
    expect(mailer.getOutbox()).toHaveLength(4);
  });

  it("locks after OTP_MAX_ATTEMPTS and does not reset attempts on resend", async () => {
    const challenge = await requestChallenge(uniqueEmail("locked"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(server())
        .post(v1.auth.ROUTES.emailOtp.verify)
        .send({ challengeId: challenge.challengeId, code: "111111" });
      expect(response.status).toBe(401);
    }

    const locked = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    });
    expect(locked.attemptsCount).toBe(5);

    const correct = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: challenge.challengeId, code: DEV_OTP });
    expect(correct.status).toBe(401);

    const resend = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId: challenge.challengeId });
    expect(resend.status).toBe(401);
  });

  it("rejects expired, replayed, and cross-purpose challenges uniformly", async () => {
    const expired = await requestChallenge(uniqueEmail("expired"));
    await prisma.otpChallenge.update({
      where: { id: expired.challengeId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    const expiredResponse = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: expired.challengeId, code: DEV_OTP });
    expect(expiredResponse.status).toBe(401);

    const replayEmail = uniqueEmail("replay");
    const replay = await requestChallenge(replayEmail);
    const success = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: replay.challengeId, code: DEV_OTP });
    expect(success.status).toBe(200);
    const replayed = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: replay.challengeId, code: DEV_OTP });
    expect(replayed.status).toBe(401);
    const created = await prisma.user.findUniqueOrThrow({
      where: { email: replayEmail },
    });
    createdUserIds.push(created.id);

    const oauthId = crypto.randomUUID();
    await prisma.otpChallenge.create({
      data: {
        id: oauthId,
        activeKey: `test-oauth:${oauthId}`,
        channel: "EMAIL",
        purpose: "OAUTH_EMAIL_VERIFY",
        target: uniqueEmail("cross-purpose"),
        provider: "google",
        providerId: `provider-${oauthId}`,
        codeHash: hashOtp(DEV_OTP, process.env.OTP_HMAC_SECRET as string),
        expiresAt: new Date(Date.now() + 60_000),
        nextSendAt: new Date(Date.now() + 30_000),
      },
    });
    createdChallengeIds.push(oauthId);
    const crossPurpose = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: oauthId, code: DEV_OTP });
    expect(crossPurpose.status).toBe(401);
  });

  it("allows exactly one concurrent verification to create the user and session", async () => {
    const email = uniqueEmail("concurrent");
    const challenge = await requestChallenge(email);

    const responses = await Promise.all([
      request(server())
        .post(v1.auth.ROUTES.emailOtp.verify)
        .send({ challengeId: challenge.challengeId, code: DEV_OTP }),
      request(server())
        .post(v1.auth.ROUTES.emailOtp.verify)
        .send({ challengeId: challenge.challengeId, code: DEV_OTP }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);

    const usersForEmail = await prisma.user.findMany({
      where: { email },
      include: { sessions: true },
    });
    expect(usersForEmail).toHaveLength(1);
    expect(usersForEmail[0]?.sessions).toHaveLength(1);
    if (usersForEmail[0]) createdUserIds.push(usersForEmail[0].id);
  });
});

describe("EmailOtpController throttling (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: SpyMailerService;
  const challengeIds: string[] = [];

  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useClass(SpyMailerService)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    mailer = app.get(MailerService);
  });

  afterAll(async () => {
    await prisma.otpChallenge.deleteMany({
      where: { id: { in: challengeIds } },
    });
    await prisma.otpDeliveryQuota.deleteMany();
    await app.close();
  });

  it("the 21st request from one IP returns 429", async () => {
    const email = uniqueEmail("throttle");
    for (let requestNumber = 1; requestNumber <= 20; requestNumber += 1) {
      const response = await request(server())
        .post(v1.auth.ROUTES.emailOtp.request)
        .send({ email });
      expect(response.status).toBe(202);
      if (requestNumber === 1) {
        challengeIds.push(
          v1.auth.otpChallengeMetadataSchema.parse(response.body).challengeId,
        );
      }
    }

    const response = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(response.status).toBe(429);
    expect(mailer.getOutbox()).toHaveLength(1);
  });
});

describe("EmailOtp delivery rollback (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: FailOnceMailerService;
  const challengeIds: string[] = [];

  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useClass(FailOnceMailerService)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    mailer = app.get(MailerService);
  });

  afterAll(async () => {
    await prisma.otpChallenge.deleteMany({
      where: { id: { in: challengeIds } },
    });
    await prisma.otpDeliveryQuota.deleteMany();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.otpDeliveryQuota.deleteMany();
  });

  it("deletes a newly-created challenge when initial delivery fails", async () => {
    const email = uniqueEmail("initial-mail-failure");
    mailer.failNext();

    const response = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(response.status).toBe(500);
    expect(await prisma.otpChallenge.count({ where: { target: email } })).toBe(
      0,
    );
  });

  it("restores resend counters and cooldown when resend delivery fails", async () => {
    const email = uniqueEmail("resend-mail-failure");
    const initial = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(initial.status).toBe(202);
    const challengeId = v1.auth.otpChallengeMetadataSchema.parse(
      initial.body,
    ).challengeId;
    challengeIds.push(challengeId);

    const previousNextSendAt = new Date(Date.now() - 1);
    const before = await prisma.otpChallenge.update({
      where: { id: challengeId },
      data: { nextSendAt: previousNextSendAt },
    });
    const quotaState = async () =>
      (
        await prisma.otpDeliveryQuota.findMany({
          orderBy: [{ bucket: "asc" }, { subjectHash: "asc" }],
        })
      ).map(({ bucket, subjectHash, windowStart, windowEnd, count }) => ({
        bucket,
        subjectHash,
        windowStart,
        windowEnd,
        count,
      }));
    const quotasBeforeFailure = await quotaState();

    mailer.failNext();
    const response = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId });
    expect(response.status).toBe(500);

    const after = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challengeId },
    });
    expect(after.sentCount).toBe(before.sentCount);
    expect(after.lastSentAt).toEqual(before.lastSentAt);
    expect(after.nextSendAt).toEqual(previousNextSendAt);
    expect(await quotaState()).toEqual(quotasBeforeFailure);
  });
});

class FailOnceMailerService extends SpyMailerService {
  private shouldFail = false;

  failNext(): void {
    this.shouldFail = true;
  }

  override send(message: MailerMessage): Promise<void> {
    if (this.shouldFail) {
      this.shouldFail = false;
      return Promise.reject(new Error("simulated mail failure"));
    }
    return super.send(message);
  }
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`;
}
