/**
 * HTTP-level E2E tests for `POST /v1/auth/google`.
 *
 * The Google ID-token verifier is replaced with `FakeGoogleVerifier` —
 * tests register `(idToken → claims)` mappings up front so each
 * scenario is deterministic and no network access is required. The
 * rest of the stack (thin controller, service-owned orchestration,
 * transaction-wrapped resolution, session issuance, cookie writes, and
 * audit emission) runs as it would in production.
 *
 * Test data is cleaned up `afterAll` by deleting the users created in
 * each scenario; audit rows referencing deleted users survive with
 * `userId = NULL` (SetNull cascade) and are pruned by type at the end.
 */
process.env.THROTTLE_LOGIN_PER_IP_PER_MIN = "10000";
process.env.THROTTLE_GLOBAL_PER_IP_PER_MIN = "10000";
process.env.THROTTLE_OTP_REQUESTS_PER_IP_PER_MIN = "10000";
process.env.OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR = "10000";
process.env.OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY = "10000";
process.env.OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR = "10000";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { AuditEventType } from "../src/audit/audit.types";
import { FakeGoogleVerifier } from "../src/auth/modules/google/fake-google-verifier.service";
import { GoogleVerifier } from "../src/auth/modules/google/google-verifier.interface";
import { SpyMailerService } from "../src/mailer/impls/spy-mailer.service";
import { MailerService } from "../src/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

describe("GoogleAuthController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let verifier: FakeGoogleVerifier;
  let mailer: SpyMailerService;

  const createdUserIds: string[] = [];
  const createdChallengeIds: string[] = [];
  const startedAt = new Date();

  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleVerifier)
      .useClass(FakeGoogleVerifier)
      .overrideProvider(MailerService)
      .useClass(SpyMailerService)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    verifier = app.get(GoogleVerifier);
    mailer = app.get(MailerService);
  });

  afterEach(() => {
    verifier.reset();
    mailer.reset();
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
    // Drop the audit events this suite generated. Filtering by
    // `createdAt >= startedAt` keeps us from touching seed rows or rows
    // written by parallel jest workers (per-worker schema isolates DB,
    // but startedAt is a defensive lower bound).
    await prisma.auditEvent.deleteMany({
      where: {
        createdAt: { gte: startedAt },
        type: {
          in: [
            AuditEventType.SIGNUP,
            AuditEventType.OAUTH_LINKED,
            AuditEventType.EMAIL_VERIFIED,
            AuditEventType.LOGIN_SUCCESS,
            AuditEventType.LOGIN_FAIL,
          ],
        },
        OR: [
          { meta: { path: ["method"], equals: "google" } },
          { meta: { path: ["provider"], equals: "google" } },
        ],
      },
    });
    await prisma.otpDeliveryQuota.deleteMany();
    await app.close();
  });

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────

  async function recentAudit(
    type: AuditEventType,
    userId: string | null,
  ): Promise<{ type: string; meta: unknown } | null> {
    const row = await prisma.auditEvent.findFirst({
      where: { type, userId, createdAt: { gte: startedAt } },
      orderBy: { createdAt: "desc" },
    });
    return row ? { type: row.type, meta: row.meta } : null;
  }

  function uniqueEmail(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  }

  function uniqueSub(prefix: string): string {
    return `g-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  // ────────────────────────────────────────────────────────────────────
  // 1. New user, Google-verified email → SIGNUP + OAUTH_LINKED + LOGIN_SUCCESS
  // ────────────────────────────────────────────────────────────────────

  it("creates a new user when no prior link or email match exists", async () => {
    const idToken = "token-new-user-padded-aaaaaaaa";
    const email = uniqueEmail("g-new");
    const sub = uniqueSub("new");
    verifier.register(idToken, {
      sub,
      email,
      emailVerified: true,
      name: "Newbie Person",
    });

    const res = await request(server())
      .post("/v1/auth/google")
      .send({ idToken });
    const body = res.body as v1.auth.TokenPair;

    expect(res.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const cookies = res.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    expect(cookies?.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies?.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { authAccounts: true },
    });
    expect(user).not.toBeNull();
    if (!user) throw new Error();
    createdUserIds.push(user.id);

    expect(user.emailVerified).not.toBeNull();
    expect(user.firstName).toBe("Newbie");
    expect(user.lastName).toBe("Person");
    expect(user.authAccounts).toHaveLength(1);
    expect(user.authAccounts[0]?.provider).toBe("google");
    expect(user.authAccounts[0]?.providerId).toBe(sub);

    expect(await recentAudit(AuditEventType.SIGNUP, user.id)).toMatchObject({
      meta: { method: "google" },
    });
    expect(
      await recentAudit(AuditEventType.OAUTH_LINKED, user.id),
    ).toMatchObject({ meta: { provider: "google" } });
    expect(
      await recentAudit(AuditEventType.LOGIN_SUCCESS, user.id),
    ).toMatchObject({ meta: { method: "google" } });
  });

  it("serializes concurrent first sign-ins into one user and one linked account", async () => {
    const idToken = "token-concurrent-padded-aaaaaaaa";
    const email = uniqueEmail("g-concurrent");
    const sub = uniqueSub("concurrent");
    verifier.register(idToken, {
      sub,
      email,
      emailVerified: true,
      name: "Concurrent Person",
    });

    const [first, second] = await Promise.all([
      request(server()).post("/v1/auth/google").send({ idToken }),
      request(server()).post("/v1/auth/google").send({ idToken }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const users = await prisma.user.findMany({
      where: { email: email.toLowerCase() },
      include: { authAccounts: true, sessions: true },
    });
    expect(users).toHaveLength(1);

    const user = users[0];
    if (!user) throw new Error();
    createdUserIds.push(user.id);
    expect(user.authAccounts).toHaveLength(1);
    expect(user.authAccounts[0]?.providerId).toBe(sub);
    expect(user.sessions).toHaveLength(2);

    const audits = await prisma.auditEvent.findMany({
      where: { userId: user.id },
    });
    expect(
      audits.filter((row) => row.type === AuditEventType.SIGNUP),
    ).toHaveLength(1);
    expect(
      audits.filter((row) => row.type === AuditEventType.OAUTH_LINKED),
    ).toHaveLength(1);
    expect(
      audits.filter((row) => row.type === AuditEventType.LOGIN_SUCCESS),
    ).toHaveLength(2);
  });

  // ────────────────────────────────────────────────────────────────────
  // 2. Existing AuthAccount → LOGIN_SUCCESS only (no new AuthAccount)
  // ────────────────────────────────────────────────────────────────────

  it("re-signs in an existing linked user even when the current email claim is unverified", async () => {
    const sub = uniqueSub("repeat");
    const user = await users.createOne({
      email: uniqueEmail("g-repeat"),
      emailVerified: new Date(),
      authAccounts: {
        create: {
          provider: "google",
          providerId: sub,
          email: "old@example.com",
        },
      },
    });
    createdUserIds.push(user.id);

    const idToken = "token-repeat-padded-aaaaaaaa";
    verifier.register(idToken, {
      sub,
      email: user.email,
      emailVerified: false,
    });

    const res = await request(server())
      .post("/v1/auth/google")
      .send({ idToken });
    expect(res.status).toBe(200);

    const accounts = await prisma.authAccount.findMany({
      where: { userId: user.id, provider: "google" },
    });
    expect(accounts).toHaveLength(1);
    // AuthAccount.email is updated to Google's current value.
    expect(accounts[0]?.email).toBe(user.email);

    expect(
      await recentAudit(AuditEventType.LOGIN_SUCCESS, user.id),
    ).not.toBeNull();
    expect(await recentAudit(AuditEventType.SIGNUP, user.id)).toBeNull();
    expect(await recentAudit(AuditEventType.OAUTH_LINKED, user.id)).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────
  // 3. Auto-link by verified email
  // ────────────────────────────────────────────────────────────────────

  it("auto-links Google when the email matches an existing user and Google verified it", async () => {
    const email = uniqueEmail("g-autolink");
    const user = await users.createOne({
      email,
      emailVerified: new Date(),
    });
    createdUserIds.push(user.id);

    const idToken = "token-autolink-padded-aaaaaaaa";
    const sub = uniqueSub("autolink");
    verifier.register(idToken, { sub, email, emailVerified: true });

    const res = await request(server())
      .post("/v1/auth/google")
      .send({ idToken });
    expect(res.status).toBe(200);

    const accounts = await prisma.authAccount.findMany({
      where: { userId: user.id, provider: "google" },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.providerId).toBe(sub);

    expect(
      await recentAudit(AuditEventType.OAUTH_LINKED, user.id),
    ).toMatchObject({ meta: { provider: "google" } });
    expect(
      await recentAudit(AuditEventType.LOGIN_SUCCESS, user.id),
    ).not.toBeNull();
    expect(await recentAudit(AuditEventType.SIGNUP, user.id)).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────
  // 4. Unverified Google emails require proof without local enumeration
  // ────────────────────────────────────────────────────────────────────

  it("returns the same challenge shape for existing and unknown unverified emails, then links or creates only after OTP proof", async () => {
    const existingEmail = uniqueEmail("g-unverified-existing");
    const unknownEmail = uniqueEmail("g-unverified-unknown");
    const existingSub = uniqueSub("unverified-existing");
    const unknownSub = uniqueSub("unverified-unknown");
    const user = await users.createOne({
      email: existingEmail,
      emailVerified: new Date(),
    });
    createdUserIds.push(user.id);

    const existingToken = "token-unverified-existing-aaaa";
    const unknownToken = "token-unverified-unknown-aaaaaa";
    verifier.register(existingToken, {
      sub: existingSub,
      email: existingEmail,
      emailVerified: false,
    });
    verifier.register(unknownToken, {
      sub: unknownSub,
      email: unknownEmail,
      emailVerified: false,
    });

    const existingResponse = await request(server())
      .post("/v1/auth/google")
      .send({ idToken: existingToken });
    const unknownResponse = await request(server())
      .post("/v1/auth/google")
      .set("X-Locale", "ro")
      .send({ idToken: unknownToken });
    const existingBody =
      existingResponse.body as v1.auth.OAuthEmailVerificationRequired;
    const unknownBody =
      unknownResponse.body as v1.auth.OAuthEmailVerificationRequired;

    expect(existingResponse.status).toBe(202);
    expect(unknownResponse.status).toBe(202);
    expect(existingBody).toMatchObject({
      status: "verification_required",
      expiresInSec: expect.any(Number) as number,
    });
    expect(unknownBody).toMatchObject({
      status: "verification_required",
      expiresInSec: expect.any(Number) as number,
    });
    expect(Object.keys(existingBody).sort()).toEqual(
      Object.keys(unknownBody).sort(),
    );
    expect(existingBody.challengeId).not.toBe(unknownBody.challengeId);
    createdChallengeIds.push(existingBody.challengeId, unknownBody.challengeId);
    expect(mailer.findLastTo(existingEmail)).toMatchObject({
      subject: "Your sign-in code",
      text: "Your code is 000000. It expires in 10 minutes.",
    });
    expect(mailer.findLastTo(unknownEmail)).toMatchObject({
      subject: "Codul tău de autentificare",
      text: "Codul tău este 000000. Expiră în 10 minute.",
    });

    const accounts = await prisma.authAccount.findMany({
      where: { userId: user.id, provider: "google" },
    });
    expect(accounts).toHaveLength(0);
    expect(
      await prisma.user.findUnique({ where: { email: unknownEmail } }),
    ).toBeNull();

    const existingVerify = await request(server())
      .post(v1.auth.ROUTES.oauthEmailVerification.verify)
      .send({ challengeId: existingBody.challengeId, code: "000000" });
    expect(existingVerify.status).toBe(200);
    expect(existingVerify.body).toMatchObject({
      accessToken: expect.any(String) as string,
      refreshToken: expect.any(String) as string,
    });

    const linked = await prisma.authAccount.findUnique({
      where: {
        provider_providerId: {
          provider: "google",
          providerId: existingSub,
        },
      },
    });
    expect(linked?.userId).toBe(user.id);

    const unknownVerify = await request(server())
      .post(v1.auth.ROUTES.oauthEmailVerification.verify)
      .send({ challengeId: unknownBody.challengeId, code: "000000" });
    expect(unknownVerify.status).toBe(200);

    const created = await prisma.user.findUnique({
      where: { email: unknownEmail },
      include: { authAccounts: true },
    });
    expect(created).not.toBeNull();
    if (!created) throw new Error();
    createdUserIds.push(created.id);
    expect(created.emailVerified).not.toBeNull();
    expect(created.authAccounts).toHaveLength(1);
    expect(created.authAccounts[0]?.provider).toBe("google");

    const replay = await request(server())
      .post(v1.auth.ROUTES.oauthEmailVerification.verify)
      .send({ challengeId: unknownBody.challengeId, code: "000000" });
    expect(replay.status).toBe(401);
  });

  it("increments attempts for a wrong OAuth email code without consuming the challenge", async () => {
    const idToken = "token-unverified-wrong-code-aaaaaa";
    const email = uniqueEmail("g-unverified-wrong");
    verifier.register(idToken, {
      sub: uniqueSub("unverified-wrong"),
      email,
      emailVerified: false,
    });

    const signIn = await request(server())
      .post(v1.auth.ROUTES.google)
      .send({ idToken });
    const challenge = signIn.body as v1.auth.OAuthEmailVerificationRequired;
    expect(signIn.status).toBe(202);
    createdChallengeIds.push(challenge.challengeId);

    const wrong = await request(server())
      .post(v1.auth.ROUTES.oauthEmailVerification.verify)
      .send({ challengeId: challenge.challengeId, code: "111111" });
    expect(wrong.status).toBe(401);

    const row = await prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    });
    expect(row.attemptsCount).toBe(1);
    expect(row.usedAt).toBeNull();

    const correct = await request(server())
      .post(v1.auth.ROUTES.oauthEmailVerification.verify)
      .send({ challengeId: challenge.challengeId, code: "000000" });
    expect(correct.status).toBe(200);

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).not.toBeNull();
    if (created) createdUserIds.push(created.id);
  });

  it("allows only one concurrent verification to claim a challenge", async () => {
    const idToken = "token-unverified-concurrent-aaaaaa";
    const email = uniqueEmail("g-unverified-concurrent");
    verifier.register(idToken, {
      sub: uniqueSub("unverified-concurrent"),
      email,
      emailVerified: false,
    });

    const signIn = await request(server())
      .post(v1.auth.ROUTES.google)
      .send({ idToken });
    const challenge = signIn.body as v1.auth.OAuthEmailVerificationRequired;
    expect(signIn.status).toBe(202);
    createdChallengeIds.push(challenge.challengeId);

    const responses = await Promise.all([
      request(server())
        .post(v1.auth.ROUTES.oauthEmailVerification.verify)
        .send({ challengeId: challenge.challengeId, code: "000000" }),
      request(server())
        .post(v1.auth.ROUTES.oauthEmailVerification.verify)
        .send({ challengeId: challenge.challengeId, code: "000000" }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);

    const created = await prisma.user.findUnique({
      where: { email },
      include: { authAccounts: true, sessions: true },
    });
    expect(created).not.toBeNull();
    if (!created) throw new Error();
    createdUserIds.push(created.id);
    expect(created.authAccounts).toHaveLength(1);
    expect(created.sessions).toHaveLength(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // 5. Verifier rejects the token → 401, LOGIN_FAIL with verifier-rejected
  // ────────────────────────────────────────────────────────────────────

  it("returns 401 when the verifier rejects the token", async () => {
    const idToken = "token-bad-padded-aaaaaaaaaaaaa";
    verifier.fail(idToken);

    const res = await request(server())
      .post("/v1/auth/google")
      .send({ idToken });
    expect(res.status).toBe(401);

    const fail = await recentAudit(AuditEventType.LOGIN_FAIL, null);
    expect(fail).toMatchObject({
      meta: { method: "google", reason: "verifier-rejected" },
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 6. Schema strictness — unknown keys produce 400
  // ────────────────────────────────────────────────────────────────────

  it("rejects bodies with extra keys (strict schema → 400)", async () => {
    const res = await request(server())
      .post("/v1/auth/google")
      .send({ idToken: "anything-long-enough-to-pass-min", extra: "nope" });
    expect(res.status).toBe(400);
  });

  it("rejects bodies missing idToken (400)", async () => {
    const res = await request(server()).post("/v1/auth/google").send({});
    expect(res.status).toBe(400);
  });

  it("rejects bodies whose idToken is too short (400)", async () => {
    const res = await request(server())
      .post("/v1/auth/google")
      .send({ idToken: "short" });
    expect(res.status).toBe(400);
  });
});
