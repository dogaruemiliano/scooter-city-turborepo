/**
 * HTTP-level E2E tests for `POST /v1/auth/google`.
 *
 * The Google ID-token verifier is replaced with `FakeGoogleVerifier` —
 * tests register `(idToken → claims)` mappings up front so each
 * scenario is deterministic and no network access is required. The
 * rest of the stack (controller, service, transaction-wrapped
 * resolveUser, `CoreAuthService.issueSession`, cookie writes, audit
 * emission) runs as it would in production.
 *
 * Test data is cleaned up `afterAll` by deleting the users created in
 * each scenario; audit rows referencing deleted users survive with
 * `userId = NULL` (SetNull cascade) and are pruned by type at the end.
 */
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
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

describe("GoogleAuthController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let verifier: FakeGoogleVerifier;

  const createdUserIds: string[] = [];
  const startedAt = new Date();

  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleVerifier)
      .useClass(FakeGoogleVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    users = app.get(UsersService);
    verifier = app.get(GoogleVerifier) as FakeGoogleVerifier;
  });

  afterEach(() => {
    verifier.reset();
  });

  afterAll(async () => {
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
            AuditEventType.LOGIN_SUCCESS,
            AuditEventType.LOGIN_FAIL,
          ],
        },
        meta: { path: ["method"], equals: "google" },
      },
    });
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

  // ────────────────────────────────────────────────────────────────────
  // 2. Existing AuthAccount → LOGIN_SUCCESS only (no new AuthAccount)
  // ────────────────────────────────────────────────────────────────────

  it("re-signs in an existing user without creating another AuthAccount", async () => {
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
      emailVerified: true,
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
  // 4. Unverified Google email collides with existing local user → 409
  // ────────────────────────────────────────────────────────────────────

  it("returns 409 when Google did not verify the email and the address already exists", async () => {
    const email = uniqueEmail("g-conflict");
    const user = await users.createOne({
      email,
      emailVerified: new Date(),
    });
    createdUserIds.push(user.id);

    const idToken = "token-conflict-padded-aaaaaaaa";
    const sub = uniqueSub("conflict");
    verifier.register(idToken, { sub, email, emailVerified: false });

    const res = await request(server())
      .post("/v1/auth/google")
      .send({ idToken });
    expect(res.status).toBe(409);

    const accounts = await prisma.authAccount.findMany({
      where: { userId: user.id, provider: "google" },
    });
    expect(accounts).toHaveLength(0);

    const fail = await recentAudit(AuditEventType.LOGIN_FAIL, null);
    expect(fail).toMatchObject({
      meta: { method: "google", reason: "email-not-verified-by-provider" },
    });
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
