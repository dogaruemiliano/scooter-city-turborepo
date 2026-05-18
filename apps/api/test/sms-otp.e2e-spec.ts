/**
 * SMS-OTP HTTP-level e2e tests. Mirror of `email-otp.e2e-spec.ts`,
 * swapping the channel/transport:
 *
 *   - email → phone (E.164)
 *   - MailerService → SmsService (`SpySmsService` test double)
 *   - User.emailVerified → User.phoneVerified
 *   - channel "EMAIL" → channel "SMS"
 *
 * Covers /request happy + anti-enumeration; /verify happy +
 * wrong-code lockout + expired + unknown-phone; and throttler 429.
 *
 * The audit shape differs slightly from email-OTP: SMS-OTP does not emit
 * a `PHONE_VERIFIED` event (none exists in `AuditEventType`). The
 * verify happy path therefore only asserts `LOGIN_SUCCESS` and `SIGNUP`.
 */

// Enable the method module before AppModule is constructed. setup-env
// wins for unset keys; explicit writes here win unconditionally.
process.env.AUTH_SMS_OTP_ENABLED = "true";
process.env.SMS_PROVIDER = "log";

// Throttler — lower the per-IP bucket so the 21st-call test finishes
// fast; raise the others so they never bind during the rest of the
// suite.
process.env.THROTTLE_OTP_PER_IP_PER_HOUR = "20";
process.env.THROTTLE_OTP_PER_TARGET_PER_HOUR = "10000";
process.env.THROTTLE_OTP_PER_TARGET_PER_DAY = "10000";
process.env.THROTTLE_LOGIN_PER_IP_PER_MIN = "10000";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { AuditEventType } from "../src/audit/audit.types";
import { PrismaService } from "../src/prisma/prisma.service";
import { SmsService } from "../src/sms/sms.service";
import { SpySmsService } from "../src/sms/impls/spy-sms.service";
import { UsersService } from "../src/users/users.service";

const DEV_OTP = "000000";

/**
 * Returns a unique E.164 phone number for the duration of this test
 * suite. Uses a Romanian prefix (`+407`) plus an 8-digit suffix derived
 * from `Date.now()` and a random salt — gives ~10^7 distinct values per
 * second, more than enough to avoid clashes inside a single run.
 */
function freshPhone(): string {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`.slice(-8);
  return `+407${suffix}`;
}

describe("SmsOtpController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let sms: SpySmsService;

  const createdUserIds: string[] = [];

  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SmsService)
      .useClass(SpySmsService)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    sms = app.get(SmsService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  afterEach(() => {
    sms.reset();
  });

  async function freshUser(opts: { phoneVerified?: Date | null } = {}) {
    const phone = freshPhone();
    // `email` is required on the User model even when the auth method is
    // phone-only — see schema.prisma. Generate a deterministic-from-phone
    // email so duplicate-phone tests would surface as the right error.
    const email = `sotp-${phone.slice(1)}@example.com`;
    const user = await users.createOne({
      email,
      phone,
      ...(opts.phoneVerified !== undefined
        ? { phoneVerified: opts.phoneVerified }
        : {}),
    });
    createdUserIds.push(user.id);
    return user;
  }

  // ────────────────────────────────────────────────────────────────────
  // /request
  // ────────────────────────────────────────────────────────────────────

  it("POST /request with unknown phone → 202, no row inserted, no SMS sent", async () => {
    const unknownPhone = freshPhone();
    const res = await request(server())
      .post(v1.auth.ROUTES.smsOtp.request)
      .send({ phone: unknownPhone });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "sent" });

    const rows = await prisma.otpToken.count({
      where: { user: { phone: unknownPhone } },
    });
    expect(rows).toBe(0);
    expect(sms.findLastTo(unknownPhone)).toBeUndefined();
  });

  it("POST /request with known phone → 202, one fresh OtpToken row, one SMS", async () => {
    const user = await freshUser();
    const res = await request(server())
      .post(v1.auth.ROUTES.smsOtp.request)
      .send({ phone: user.phone });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "sent" });

    const rows = await prisma.otpToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe("SMS");
    expect(rows[0]?.purpose).toBe("AUTH");
    expect(rows[0]?.attemptsCount).toBe(0);
    expect(rows[0]?.used).toBe(false);
    expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const sent = sms.findLastTo(user.phone!);
    expect(sent).toBeDefined();
    expect(sent?.body).toContain(DEV_OTP);
  });

  // ────────────────────────────────────────────────────────────────────
  // /verify happy path
  // ────────────────────────────────────────────────────────────────────

  it("POST /verify with the dev OTP returns TokenPair + cookies, marks row used, creates a Session, sets phoneVerified, emits SIGNUP + LOGIN_SUCCESS audits", async () => {
    const user = await freshUser({ phoneVerified: null });

    await request(server())
      .post(v1.auth.ROUTES.smsOtp.request)
      .send({ phone: user.phone });

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(before.phoneVerified).toBeNull();

    const res = await request(server())
      .post(v1.auth.ROUTES.smsOtp.verify)
      .send({ phone: user.phone, code: DEV_OTP });
    const body = res.body as v1.auth.TokenPair;

    expect(res.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    const setCookies = res.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    expect(setCookies?.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(setCookies?.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const otp = await prisma.otpToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(otp.used).toBe(true);

    const sessions = await prisma.session.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(sessions).toBe(1);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.phoneVerified).not.toBeNull();

    const auditRows = await prisma.auditEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    const types = auditRows.map((r) => r.type);
    expect(types).toContain(AuditEventType.LOGIN_SUCCESS);
    expect(types).toContain(AuditEventType.SIGNUP);
  });

  // ────────────────────────────────────────────────────────────────────
  // /verify — wrong-code lockout
  // ────────────────────────────────────────────────────────────────────

  it("5 wrong attempts increments attemptsCount and locks the row; 6th attempt is refused without re-checking", async () => {
    const user = await freshUser({ phoneVerified: new Date() });
    await request(server())
      .post(v1.auth.ROUTES.smsOtp.request)
      .send({ phone: user.phone });

    for (let i = 0; i < 5; i++) {
      const res = await request(server())
        .post(v1.auth.ROUTES.smsOtp.verify)
        .send({ phone: user.phone, code: "111111" });
      expect(res.status).toBe(401);
    }

    const row = await prisma.otpToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(row.attemptsCount).toBe(5);
    expect(row.used).toBe(false);

    // Sixth attempt — correct code, but locked out.
    const sixth = await request(server())
      .post(v1.auth.ROUTES.smsOtp.verify)
      .send({ phone: user.phone, code: DEV_OTP });
    expect(sixth.status).toBe(401);

    const after = await prisma.otpToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(after.attemptsCount).toBe(5);
    expect(after.used).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // /verify — expired row
  // ────────────────────────────────────────────────────────────────────

  it("expired row → 401 with a generic message", async () => {
    const user = await freshUser({ phoneVerified: new Date() });
    await request(server())
      .post(v1.auth.ROUTES.smsOtp.request)
      .send({ phone: user.phone });

    await prisma.otpToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const res = await request(server())
      .post(v1.auth.ROUTES.smsOtp.verify)
      .send({ phone: user.phone, code: DEV_OTP });
    expect(res.status).toBe(401);
    expect(res.body?.error?.message ?? res.body?.message).toMatch(
      /invalid or expired code/i,
    );
  });

  // ────────────────────────────────────────────────────────────────────
  // /verify — unknown phone (anti-enumeration)
  // ────────────────────────────────────────────────────────────────────

  it("unknown phone → 401 generic; response time is on the same order of magnitude as the happy path", async () => {
    const user = await freshUser({ phoneVerified: new Date() });
    await request(server())
      .post(v1.auth.ROUTES.smsOtp.request)
      .send({ phone: user.phone });

    const tHappyStart = Date.now();
    const happy = await request(server())
      .post(v1.auth.ROUTES.smsOtp.verify)
      .send({ phone: user.phone, code: DEV_OTP });
    const tHappy = Date.now() - tHappyStart;
    expect(happy.status).toBe(200);

    const tUnknownStart = Date.now();
    const unknown = await request(server())
      .post(v1.auth.ROUTES.smsOtp.verify)
      .send({
        phone: freshPhone(),
        code: DEV_OTP,
      });
    const tUnknown = Date.now() - tUnknownStart;
    expect(unknown.status).toBe(401);

    // Same security property as email-OTP: the unknown path must not
    // return measurably faster than the happy one. Lower-bound only —
    // dev-laptop noise swamps any tighter assertion.
    const ratio = tUnknown / Math.max(tHappy, 1);
    expect(ratio).toBeGreaterThan(0.5);
  });
});

// ──────────────────────────────────────────────────────────────────────
// /request — throttler
// ──────────────────────────────────────────────────────────────────────
//
// Separate describe block with its own NestApplication so the
// throttler's in-memory counters start fresh.

describe("SmsOtpController throttling (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;

  const createdUserIds: string[] = [];

  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SmsService)
      .useClass(SpySmsService)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    users = app.get(UsersService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  it("the 21st /request from the same IP within an hour returns 429", async () => {
    const phone = freshPhone();
    const email = `sotp-throttle-${phone.slice(1)}@example.com`;
    const user = await users.createOne({ email, phone });
    createdUserIds.push(user.id);

    for (let i = 1; i <= 20; i++) {
      const res = await request(server())
        .post(v1.auth.ROUTES.smsOtp.request)
        .send({ phone: user.phone });
      expect(res.status).toBe(202);
    }

    const res = await request(server())
      .post(v1.auth.ROUTES.smsOtp.request)
      .send({ phone: user.phone });
    expect(res.status).toBe(429);
  });
});
