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
const provisionedIds: string[] = [];
async function approve(prisma: PrismaService, email: string) {
  const user = await prisma.user.create({
    data: { email, loginStatus: "ACTIVE" },
  });
  provisionedIds.push(user.id);
  return user;
}

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
    await prisma.userInvitation.deleteMany({
      where: { userId: { in: provisionedIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: provisionedIds } } });
    await app.close();
  });

  afterEach(() => {
    mailer.reset();
  });

  async function freshUser(opts: { emailVerified?: Date | null } = {}) {
    const email = uniqueEmail("existing");
    const user = await users.createOne({
      loginStatus: "ACTIVE",
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
    headers: Record<string, string> = {},
  ): Promise<v1.auth.OtpChallengeMetadata> {
    const requestBuilder = request(server()).post(
      v1.auth.ROUTES.emailOtp.request,
    );
    for (const [name, value] of Object.entries(headers)) {
      requestBuilder.set(name, value);
    }
    const response = await requestBuilder.send({ email });
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
    ).toBeNull();
    expect(mailer.findLastTo(existing.email)?.text).toContain(DEV_OTP);
    expect(mailer.findLastTo(unknownEmail)).toBeUndefined();
    const rejected = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: unknownChallenge.challengeId, code: DEV_OTP });
    expect(rejected.status).toBe(401);
    expect(
      await prisma.user.findUnique({ where: { email: unknownEmail } }),
    ).toBeNull();
  });

  it("localizes OTP email and known error envelopes from request locale", async () => {
    const invalidBody = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .set("X-Locale", "ro")
      .send({ email: "not-an-email" });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Cererea conține date invalide.",
      },
    });

    const email = uniqueEmail("localized");
    await approve(prisma, email);
    const challenge = await requestChallenge(email, { "X-Locale": "ro" });
    expect(mailer.findLastTo(email)).toMatchObject({
      subject: `${DEV_OTP} este codul tău de autentificare Scooter City`,
    });
    expect(mailer.findLastTo(email)?.text).toContain(DEV_OTP);
    expect(mailer.findLastTo(email)?.html).toContain('lang="ro"');

    const invalidCode = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .set("Accept-Language", "ro-RO, en;q=0.1")
      .send({ challengeId: challenge.challengeId, code: "111111" });
    expect(invalidCode.status).toBe(401);
    expect(invalidCode.body).toMatchObject({
      error: {
        code: "UNAUTHORIZED",
        message: "Codul este invalid sau a expirat.",
      },
    });
  });

  it("activates an invited email, creates one session, and records admission", async () => {
    const email = uniqueEmail("signup");
    const invited = await prisma.user.create({
      data: { email, loginStatus: "INVITED" },
    });
    provisionedIds.push(invited.id);
    await prisma.userInvitation.create({
      data: {
        userId: invited.id,
        email,
        generation: 1,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
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
    expect(user.loginStatus).toBe("ACTIVE");
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
        AuditEventType.ACCESS_ACTIVATED,
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

  it.each(["DISABLED", "SUSPENDED"] as const)(
    "rejects an already-delivered OTP after access becomes %s",
    async (loginStatus) => {
      const user = await freshUser();
      const challenge = await requestChallenge(user.email);
      await prisma.user.update({
        where: { id: user.id },
        data: { loginStatus },
      });
      const response = await request(server())
        .post(v1.auth.ROUTES.emailOtp.verify)
        .send({ challengeId: challenge.challengeId, code: DEV_OTP });
      expect(response.status).toBe(401);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        0,
      );
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .loginStatus,
      ).toBe(loginStatus);
    },
  );

  it("does not accept an old OTP for a replacement invitation generation", async () => {
    const email = uniqueEmail("replaced-invitation");
    const user = await prisma.user.create({
      data: { email, loginStatus: "INVITED" },
    });
    provisionedIds.push(user.id);
    const original = await prisma.userInvitation.create({
      data: {
        userId: user.id,
        email,
        generation: 1,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const challenge = await requestChallenge(email);
    const proof = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(726001)`;
      await tx.userInvitation.update({
        where: { id: original.id },
        data: { cancelledAt: new Date() },
      });
      await tx.userInvitation.create({
        data: {
          userId: user.id,
          email,
          generation: 2,
          createdAt: new Date(proof.createdAt.getTime() + 1),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    });
    const response = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: challenge.challengeId, code: DEV_OTP });
    expect(response.status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .loginStatus,
    ).toBe("INVITED");
  });

  it("reuses the challenge, keeps the same code, and applies 30s/2m/5m resend backoff", async () => {
    const email = uniqueEmail("resend");
    await approve(prisma, email);
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
    expect(mailer.findLastTo(email)?.text).toContain(DEV_OTP);
    expect(initialMessage).toContain(DEV_OTP);

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
    const challenge = await requestChallenge(
      (await approve(prisma, uniqueEmail("locked"))).email,
    );

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
    expect(resend.status).toBe(202);
  });

  it("rejects expired, replayed, and cross-purpose challenges uniformly", async () => {
    const expired = await requestChallenge(
      (await approve(prisma, uniqueEmail("expired"))).email,
    );
    await prisma.otpChallenge.update({
      where: { id: expired.challengeId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    const expiredResponse = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ challengeId: expired.challengeId, code: DEV_OTP });
    expect(expiredResponse.status).toBe(401);

    const replayEmail = uniqueEmail("replay");
    await approve(prisma, replayEmail);
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

  it("allows exactly one concurrent verification to issue a session", async () => {
    const email = uniqueEmail("concurrent");
    await approve(prisma, email);
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
    await prisma.userInvitation.deleteMany({
      where: { userId: { in: provisionedIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: provisionedIds } } });
    await app.close();
  });

  it("the 21st request from one IP returns 429", async () => {
    const email = uniqueEmail("throttle");
    await approve(prisma, email);
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
    await prisma.userInvitation.deleteMany({
      where: { userId: { in: provisionedIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: provisionedIds } } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.otpDeliveryQuota.deleteMany();
  });

  it("deletes a newly-created challenge when initial delivery fails", async () => {
    const email = uniqueEmail("initial-mail-failure");
    await approve(prisma, email);
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
    await approve(prisma, email);
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
