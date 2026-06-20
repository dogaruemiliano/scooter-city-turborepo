/**
 * HTTP-level E2E tests for `POST /v1/auth/apple`.
 *
 * The real `AppleVerifier` is replaced by a `FakeAppleVerifier` that
 * returns canned claims for canned tokens. This isolates the test from
 * Apple's live JWKS and lets us exercise every branch of the auto-link
 * decision matrix deterministically.
 *
 * Env mutation note: `AUTH_APPLE_ENABLED` + `APPLE_SERVICE_ID` are set
 * before `AppModule` is imported so the conditional `imports.push(
 * AppleAuthModule)` inside `AuthModule.forRoot(...)` fires.
 */
process.env.AUTH_APPLE_ENABLED = "true";
process.env.APPLE_SERVICE_ID = "com.example.app.test";
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
import { AppleVerifier } from "../src/auth/modules/apple/apple-verifier.service";
import { SpyMailerService } from "../src/mailer/impls/spy-mailer.service";
import { MailerService } from "../src/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";

import { FakeAppleVerifier } from "./fakes/apple-verifier.fake";

const APPLE_AUDIENCE = "com.example.app.test";

describe("AppleAuthController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let verifier: FakeAppleVerifier;
  let mailer: SpyMailerService;

  const createdUserIds: string[] = [];
  const createdChallengeIds: string[] = [];
  const auditTypesToClean = [
    AuditEventType.SIGNUP,
    AuditEventType.OAUTH_LINKED,
    AuditEventType.EMAIL_VERIFIED,
    AuditEventType.LOGIN_SUCCESS,
    AuditEventType.LOGIN_FAIL,
  ];

  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AppleVerifier)
      .useClass(FakeAppleVerifier)
      .overrideProvider(MailerService)
      .useClass(SpyMailerService)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    verifier = app.get(AppleVerifier);
    mailer = app.get(MailerService);
  });

  afterEach(() => {
    verifier?.reset();
    mailer?.reset();
  });

  afterAll(async () => {
    if (!app) return;
    if (createdChallengeIds.length > 0) {
      await prisma.otpChallenge.deleteMany({
        where: { id: { in: createdChallengeIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    // Broad audit-row cleanup. Every row we emit during the suite
    // carries either `meta.method = "apple"` (LOGIN_SUCCESS / SIGNUP /
    // LOGIN_FAIL) or `meta.provider = "apple"` (OAUTH_LINKED). The seed
    // never emits with either meta — cheaper than per-row id tracking.
    await prisma.auditEvent.deleteMany({
      where: {
        type: { in: auditTypesToClean },
        OR: [
          { meta: { path: ["method"], equals: "apple" } },
          { meta: { path: ["provider"], equals: "apple" } },
        ],
      },
    });
    await prisma.otpDeliveryQuota.deleteMany();
    await app.close();
  });

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function latestAuditTypesForUser(userId: string): Promise<string[]> {
    // OAUTH_LINKED is tagged `meta.provider="apple"`; LOGIN_SUCCESS /
    // SIGNUP / LOGIN_FAIL emitted by AppleAuthService are tagged
    // `meta.method="apple"`. Pull both flavours so the assertion sees
    // every Apple-attributable row.
    const rows = await prisma.auditEvent.findMany({
      where: {
        userId,
        OR: [
          { meta: { path: ["method"], equals: "apple" } },
          { meta: { path: ["provider"], equals: "apple" } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.type);
  }

  it("first sign-in with verified email creates the user, links the account, and returns a TokenPair", async () => {
    const idToken = `tok-new-${uniqueSuffix()}`;
    const email = `apple-new-${uniqueSuffix()}@example.com`;
    const sub = `apple-sub-new-${uniqueSuffix()}`;
    verifier.registerToken(idToken, {
      sub,
      email,
      emailVerified: true,
      audience: APPLE_AUDIENCE,
    });

    const res = await request(server())
      .post("/v1/auth/apple")
      .send({
        idToken,
        fullName: { givenName: "Ada", familyName: "Lovelace" },
      });

    const body = res.body as v1.auth.TokenPair;
    expect(res.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const setCookies = res.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    expect(setCookies?.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(setCookies?.some((c) => c.startsWith("refresh_token="))).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { authAccounts: true },
    });
    expect(user).not.toBeNull();
    expect(user?.emailVerified).not.toBeNull();
    expect(user?.firstName).toBe("Ada");
    expect(user?.lastName).toBe("Lovelace");
    expect(user?.authAccounts).toHaveLength(1);
    expect(user?.authAccounts[0]?.provider).toBe("apple");
    expect(user?.authAccounts[0]?.providerId).toBe(sub);
    expect(user?.authAccounts[0]?.email).toBe(email);
    if (user) createdUserIds.push(user.id);

    if (user) {
      const events = await latestAuditTypesForUser(user.id);
      expect(events).toEqual(
        expect.arrayContaining([
          AuditEventType.SIGNUP,
          AuditEventType.OAUTH_LINKED,
          AuditEventType.LOGIN_SUCCESS,
        ]),
      );
    }
  });

  it("second sign-in with the same sub but no email reuses the existing user — no new rows, no extra OAUTH_LINKED", async () => {
    const sub = `apple-sub-repeat-${uniqueSuffix()}`;
    const email = `apple-repeat-${uniqueSuffix()}@example.com`;

    // First sign-in: Apple sends email + verified.
    const firstToken = `tok-first-${uniqueSuffix()}`;
    verifier.registerToken(firstToken, {
      sub,
      email,
      emailVerified: true,
      audience: APPLE_AUDIENCE,
    });
    const first = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken: firstToken });
    expect(first.status).toBe(200);

    const userBefore = await prisma.user.findUnique({
      where: { email },
      include: { authAccounts: true },
    });
    expect(userBefore).not.toBeNull();
    if (!userBefore) return;
    createdUserIds.push(userBefore.id);
    const accountIdBefore = userBefore.authAccounts[0]?.id;

    // Second sign-in: Apple omits email (typical for return logins).
    const secondToken = `tok-second-${uniqueSuffix()}`;
    verifier.registerToken(secondToken, {
      sub,
      audience: APPLE_AUDIENCE,
    });
    const second = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken: secondToken });
    expect(second.status).toBe(200);

    const userAfter = await prisma.user.findUnique({
      where: { id: userBefore.id },
      include: { authAccounts: true },
    });
    expect(userAfter?.authAccounts).toHaveLength(1);
    expect(userAfter?.authAccounts[0]?.id).toBe(accountIdBefore);
    // Stored email is unchanged (Apple's email-rotation rule).
    expect(userAfter?.authAccounts[0]?.email).toBe(email);

    const events = await latestAuditTypesForUser(userBefore.id);
    // SIGNUP + OAUTH_LINKED from first sign-in, then only LOGIN_SUCCESS
    // for the second — exactly two LOGIN_SUCCESS, one OAUTH_LINKED.
    const linkedCount = events.filter(
      (t) => t === AuditEventType.OAUTH_LINKED,
    ).length;
    const successCount = events.filter(
      (t) => t === AuditEventType.LOGIN_SUCCESS,
    ).length;
    expect(linkedCount).toBe(1);
    expect(successCount).toBe(2);
  });

  it("accepts a private-relay email address", async () => {
    const idToken = `tok-pr-${uniqueSuffix()}`;
    const email = `xyz-${uniqueSuffix()}@privaterelay.appleid.com`;
    verifier.registerToken(idToken, {
      sub: `apple-sub-pr-${uniqueSuffix()}`,
      email,
      emailVerified: true,
      isPrivateEmail: true,
      audience: APPLE_AUDIENCE,
    });

    const res = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    if (user) createdUserIds.push(user.id);
  });

  it("auto-links an Apple account onto an existing same-email user when Apple says email_verified=true", async () => {
    const email = `apple-link-${uniqueSuffix()}@example.com`;
    // Pre-existing user with no Apple account.
    const user = await prisma.user.create({
      data: { email, emailVerified: new Date() },
    });
    createdUserIds.push(user.id);

    const idToken = `tok-link-${uniqueSuffix()}`;
    const sub = `apple-sub-link-${uniqueSuffix()}`;
    verifier.registerToken(idToken, {
      sub,
      email,
      emailVerified: true,
      audience: APPLE_AUDIENCE,
    });

    const res = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken });
    expect(res.status).toBe(200);

    const account = await prisma.authAccount.findUnique({
      where: { provider_providerId: { provider: "apple", providerId: sub } },
    });
    expect(account?.userId).toBe(user.id);
    expect(account?.email).toBe(email);

    const events = await latestAuditTypesForUser(user.id);
    expect(events).toEqual(
      expect.arrayContaining([
        AuditEventType.OAUTH_LINKED,
        AuditEventType.LOGIN_SUCCESS,
      ]),
    );
    expect(events).not.toContain(AuditEventType.SIGNUP);
  });

  it("returns the same verification challenge for existing and unknown unverified emails, then completes both safely", async () => {
    const existingEmail = `apple-unverified-existing-${uniqueSuffix()}@example.com`;
    const unknownEmail = `apple-unverified-unknown-${uniqueSuffix()}@example.com`;
    const user = await prisma.user.create({ data: { email: existingEmail } });
    createdUserIds.push(user.id);

    const existingToken = `tok-unverified-existing-${uniqueSuffix()}`;
    const unknownToken = `tok-unverified-unknown-${uniqueSuffix()}`;
    verifier.registerToken(existingToken, {
      sub: `apple-sub-unverified-existing-${uniqueSuffix()}`,
      email: existingEmail,
      emailVerified: false,
      audience: APPLE_AUDIENCE,
    });
    verifier.registerToken(unknownToken, {
      sub: `apple-sub-unverified-unknown-${uniqueSuffix()}`,
      email: unknownEmail,
      emailVerified: false,
      audience: APPLE_AUDIENCE,
    });

    const existingResponse = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken: existingToken });
    const unknownResponse = await request(server())
      .post("/v1/auth/apple")
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
    createdChallengeIds.push(existingBody.challengeId, unknownBody.challengeId);
    expect(mailer.findLastTo(existingEmail)?.text).toContain("000000");
    expect(mailer.findLastTo(unknownEmail)?.text).toContain("000000");

    expect(
      await prisma.user.findUnique({ where: { email: unknownEmail } }),
    ).toBeNull();
    expect(
      await prisma.authAccount.findMany({ where: { userId: user.id } }),
    ).toHaveLength(0);

    const existingVerify = await request(server())
      .post(v1.auth.ROUTES.oauthEmailVerification.verify)
      .send({ challengeId: existingBody.challengeId, code: "000000" });
    expect(existingVerify.status).toBe(200);

    const linked = await prisma.authAccount.findFirst({
      where: { userId: user.id, provider: "apple" },
    });
    expect(linked).not.toBeNull();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .emailVerified,
    ).not.toBeNull();

    const unknownVerify = await request(server())
      .post(v1.auth.ROUTES.oauthEmailVerification.verify)
      .send({ challengeId: unknownBody.challengeId, code: "000000" });
    expect(unknownVerify.status).toBe(200);

    const created = await prisma.user.findUnique({
      where: { email: unknownEmail },
      include: { authAccounts: true },
    });
    expect(created).not.toBeNull();
    if (created) {
      createdUserIds.push(created.id);
      expect(created.emailVerified).not.toBeNull();
      expect(created.authAccounts).toHaveLength(1);
      expect(created.authAccounts[0]?.provider).toBe("apple");
    }
  });

  it("returns 401 when the verifier rejects the token", async () => {
    const idToken = `tok-bad-${uniqueSuffix()}`;
    // Intentionally NOT registered.

    const res = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken });
    expect(res.status).toBe(401);

    const failRows = await prisma.auditEvent.findMany({
      where: {
        type: AuditEventType.LOGIN_FAIL,
        meta: { path: ["reason"], equals: "verifier-rejected" },
      },
    });
    expect(failRows.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 401 when a valid return token has no stored link and omits email", async () => {
    const idToken = `tok-missing-email-${uniqueSuffix()}`;
    const sub = `apple-sub-missing-email-${uniqueSuffix()}`;
    verifier.registerToken(idToken, {
      sub,
      audience: APPLE_AUDIENCE,
    });

    const res = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken });
    expect(res.status).toBe(401);

    const account = await prisma.authAccount.findUnique({
      where: { provider_providerId: { provider: "apple", providerId: sub } },
    });
    expect(account).toBeNull();

    const fail = await prisma.auditEvent.findFirst({
      where: {
        type: AuditEventType.LOGIN_FAIL,
        meta: { path: ["reason"], equals: "missing-email-without-link" },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(fail?.userId).toBeNull();
  });

  it("sets HttpOnly cookies on success", async () => {
    const idToken = `tok-cookies-${uniqueSuffix()}`;
    verifier.registerToken(idToken, {
      sub: `apple-sub-cookies-${uniqueSuffix()}`,
      email: `apple-cookies-${uniqueSuffix()}@example.com`,
      emailVerified: true,
      audience: APPLE_AUDIENCE,
    });

    const res = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken });
    expect(res.status).toBe(200);

    const cookies = (res.headers["set-cookie"] ?? []) as unknown as string[];
    expect(cookies.some((c) => /access_token=.+HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => /refresh_token=.+HttpOnly/i.test(c))).toBe(true);

    const user = await prisma.user.findFirst({
      where: {
        authAccounts: {
          some: {
            provider: "apple",
            providerId: { startsWith: "apple-sub-cookies-" },
          },
        },
      },
    });
    if (user) createdUserIds.push(user.id);
  });

  it("rejects bodies with unknown keys (strict zod schema → 400)", async () => {
    const idToken = `tok-extra-${uniqueSuffix()}`;
    verifier.registerToken(idToken, {
      sub: `apple-sub-extra-${uniqueSuffix()}`,
      audience: APPLE_AUDIENCE,
    });

    const res = await request(server())
      .post("/v1/auth/apple")
      .send({ idToken, surprise: "field" });

    expect(res.status).toBe(400);
  });
});
