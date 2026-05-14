/**
 * Email-OTP HTTP-level e2e tests.
 *
 * Covers:
 *
 *   - /request happy path: known + unknown email — both return 202 with
 *     `status: "sent"`, but only the known path inserts a row and mails.
 *   - /verify happy path: dev OTP `"000000"` returns 200 with a TokenPair
 *     + cookies, marks the OtpToken `used`, creates a Session row, sets
 *     `User.emailVerified`, and audits `EMAIL_VERIFIED` + `LOGIN_SUCCESS`.
 *   - /verify wrong-code lockout: 5 wrong attempts brings `attemptsCount`
 *     to 5, returns 401 each, and the 6th call is refused without
 *     re-checking the hash.
 *   - /verify expired row: backdated `expiresAt` → 401 with the generic
 *     message.
 *   - /verify unknown email: 401 with the same generic message; response
 *     time is in the same order of magnitude as the happy path.
 *   - Throttler: the 21st /request call from the same IP returns 429 when
 *     `THROTTLE_OTP_PER_IP_PER_HOUR=20`.
 *
 * Throttler limits other than the per-IP one are forced sky-high in
 * `setup-env.ts`-equivalent overrides at the top of the file so the
 * suite isn't slowed by cross-bucket interactions.
 */

// Env overrides applied before any module is loaded. Lower the per-IP
// limit to a small number we can blow through deterministically; raise
// every other bucket so they never bind during the suite. The setup-env
// helper only writes vars that are still undefined, so explicit writes
// here win.
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
import { MailerService } from "../src/mailer/mailer.service";
import { SpyMailerService } from "../src/mailer/impls/spy-mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

const DEV_OTP = "000000";

describe("EmailOtpController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let mailer: SpyMailerService;

  const createdUserIds: string[] = [];

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
    mailer = app.get(MailerService) as unknown as SpyMailerService;
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  afterEach(() => {
    mailer.reset();
  });

  async function freshUser(opts: { emailVerified?: Date | null } = {}) {
    const email = `eotp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@example.com`;
    const user = await users.createOne({
      email,
      ...(opts.emailVerified !== undefined
        ? { emailVerified: opts.emailVerified }
        : {}),
    });
    createdUserIds.push(user.id);
    return user;
  }

  // ────────────────────────────────────────────────────────────────────
  // /request
  // ────────────────────────────────────────────────────────────────────

  it("POST /request with unknown email → 202, no row inserted, no mail sent", async () => {
    const unknownEmail = `nobody-${Date.now()}@example.com`;
    const res = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: unknownEmail });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "sent" });

    const rows = await prisma.otpToken.count({
      where: { user: { email: unknownEmail } },
    });
    expect(rows).toBe(0);
    expect(mailer.findLastTo(unknownEmail)).toBeUndefined();
  });

  it("POST /request with known email → 202, one fresh OtpToken row, one mail", async () => {
    const user = await freshUser();
    const res = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: user.email });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "sent" });

    const rows = await prisma.otpToken.findMany({
      where: { userId: user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe("EMAIL");
    expect(rows[0]?.purpose).toBe("AUTH");
    expect(rows[0]?.attemptsCount).toBe(0);
    expect(rows[0]?.used).toBe(false);
    expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const sent = mailer.findLastTo(user.email);
    expect(sent).toBeDefined();
    expect(sent?.text).toContain(DEV_OTP);
  });

  // ────────────────────────────────────────────────────────────────────
  // /verify happy path
  // ────────────────────────────────────────────────────────────────────

  it("POST /verify with the dev OTP returns TokenPair + cookies, marks row used, creates a Session, sets emailVerified, emits SIGNUP + EMAIL_VERIFIED + LOGIN_SUCCESS audits", async () => {
    const user = await freshUser({ emailVerified: null });

    await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: user.email });

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(before.emailVerified).toBeNull();

    const res = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ email: user.email, code: DEV_OTP });
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
    expect(after.emailVerified).not.toBeNull();

    const auditRows = await prisma.auditEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    const types = auditRows.map((r) => r.type);
    expect(types).toContain(AuditEventType.EMAIL_VERIFIED);
    expect(types).toContain(AuditEventType.LOGIN_SUCCESS);
    expect(types).toContain(AuditEventType.SIGNUP);
  });

  // ────────────────────────────────────────────────────────────────────
  // /verify — wrong-code lockout
  // ────────────────────────────────────────────────────────────────────

  it("5 wrong attempts increments attemptsCount and locks the row; 6th attempt is refused without re-checking", async () => {
    const user = await freshUser({ emailVerified: new Date() });
    await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: user.email });

    for (let i = 0; i < 5; i++) {
      const res = await request(server())
        .post(v1.auth.ROUTES.emailOtp.verify)
        .send({ email: user.email, code: "111111" });
      expect(res.status).toBe(401);
    }

    const row = await prisma.otpToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(row.attemptsCount).toBe(5);
    expect(row.used).toBe(false);

    // Sixth attempt — correct code, but locked out (attemptsCount >=
    // OTP_MAX_ATTEMPTS=5 by default).
    const sixth = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ email: user.email, code: DEV_OTP });
    expect(sixth.status).toBe(401);

    // Counter must not have bumped to 6 (we don't re-check the hash).
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
    const user = await freshUser({ emailVerified: new Date() });
    await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: user.email });

    await prisma.otpToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const res = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ email: user.email, code: DEV_OTP });
    expect(res.status).toBe(401);
    expect(res.body?.error?.message ?? res.body?.message).toMatch(
      /invalid or expired code/i,
    );
  });

  // ────────────────────────────────────────────────────────────────────
  // /verify — unknown email (anti-enumeration)
  // ────────────────────────────────────────────────────────────────────

  it("unknown email → 401 generic; response time is on the same order of magnitude as the happy path", async () => {
    const user = await freshUser({ emailVerified: new Date() });
    await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: user.email });

    const tHappyStart = Date.now();
    const happy = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({ email: user.email, code: DEV_OTP });
    const tHappy = Date.now() - tHappyStart;
    expect(happy.status).toBe(200);

    const tUnknownStart = Date.now();
    const unknown = await request(server())
      .post(v1.auth.ROUTES.emailOtp.verify)
      .send({
        email: `ghost-${Date.now()}@example.com`,
        code: DEV_OTP,
      });
    const tUnknown = Date.now() - tUnknownStart;
    expect(unknown.status).toBe(401);

    // The security property we care about: the unknown path must not
    // return instantly relative to the happy path. The dummy bcrypt
    // compare buys roughly the same ~100ms a production mailer would,
    // so under a `LogMailerService`-backed test the unknown path is
    // actually *slower* than the happy one — that's the safer side to
    // land on. The lower-bound check below catches the bad direction
    // (unknown returning measurably faster). No upper bound: noise on a
    // dev laptop swamps any tighter assertion.
    const ratio = tUnknown / Math.max(tHappy, 1);
    expect(ratio).toBeGreaterThan(0.5);
  });
});

// ──────────────────────────────────────────────────────────────────────
// /request — throttler
// ──────────────────────────────────────────────────────────────────────
//
// Separate describe block with its own NestApplication so the
// throttler's in-memory counters start fresh — otherwise the calls
// burned by the suite above would skew the 21-call test.

describe("EmailOtpController throttling (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;

  const createdUserIds: string[] = [];

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
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  it("the 21st /request from the same IP within an hour returns 429", async () => {
    const user = await users.createOne({
      email: `throttle-${Date.now()}@example.com`,
    });
    createdUserIds.push(user.id);

    for (let i = 1; i <= 20; i++) {
      const res = await request(server())
        .post(v1.auth.ROUTES.emailOtp.request)
        .send({ email: user.email });
      expect(res.status).toBe(202);
    }

    const res = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: user.email });
    expect(res.status).toBe(429);
  });
});
