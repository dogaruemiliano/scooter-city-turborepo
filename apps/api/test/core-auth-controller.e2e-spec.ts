/**
 * HTTP-level E2E tests for the `/v1/auth/...` endpoints exposed by
 * `CoreAuthController`.
 *
 * Each test boots the full `AppModule` so the global `JwtAuthGuard`,
 * cookie parser, exception filter, and URI versioning are all active —
 * we're testing the wire as the web client sees it.
 *
 * Cleanup pattern: tests that create a user push the ID onto
 * `createdUserIds`; `afterAll` removes them. The seed users
 * (`seed-user-*`) are left alone.
 */
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { LogoutAllResponse } from "@repo/api-generated";
import type {
  EnabledAuthMethods,
  SessionSummary,
  SessionUser,
  TokenPair,
} from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

interface IssuedSession {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
}

describe("CoreAuthController (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  const createdUserIds: string[] = [];

  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
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

  async function freshSession(
    opts: { passwordHash?: string } = {},
  ): Promise<IssuedSession> {
    const user = await users.createOne({
      email: `ctrl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      passwordHash: opts.passwordHash ?? null,
    });
    createdUserIds.push(user.id);
    const issued = await coreAuth.issueSession({ user });
    return {
      userId: user.id,
      sessionId: issued.sessionId,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // /enabled-methods (public)
  // ────────────────────────────────────────────────────────────────────

  it("GET /v1/auth/enabled-methods returns the enabled-flag bag", async () => {
    const res = await request(server()).get("/v1/auth/enabled-methods");
    const body = res.body as EnabledAuthMethods;
    expect(res.status).toBe(200);
    expect(typeof body.emailOtp).toBe("boolean");
    expect(typeof body.smsOtp).toBe("boolean");
    expect(typeof body.credentials).toBe("boolean");
    expect(typeof body.google).toBe("boolean");
    expect(typeof body.facebook).toBe("boolean");
    expect(typeof body.apple).toBe("boolean");
  });

  // ────────────────────────────────────────────────────────────────────
  // /refresh (public)
  // ────────────────────────────────────────────────────────────────────

  it("POST /v1/auth/refresh with no token → 401", async () => {
    const res = await request(server()).post("/v1/auth/refresh").send({});
    expect(res.status).toBe(401);
  });

  it("POST /v1/auth/refresh with body refreshToken returns new pair and sets cookies", async () => {
    const issued = await freshSession();

    const res = await request(server())
      .post("/v1/auth/refresh")
      .send({ refreshToken: issued.refreshToken });
    const body = res.body as TokenPair;

    expect(res.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(issued.refreshToken);

    const setCookies = res.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    expect(setCookies?.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(setCookies?.some((c) => c.startsWith("refresh_token="))).toBe(true);
  });

  it("POST /v1/auth/refresh with cookie (web flow) rotates the session", async () => {
    const issued = await freshSession();

    const res = await request(server())
      .post("/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${issued.refreshToken}`])
      .send({});
    const body = res.body as TokenPair;

    expect(res.status).toBe(200);
    expect(body.refreshToken).not.toBe(issued.refreshToken);
  });

  // ────────────────────────────────────────────────────────────────────
  // /me + /sessions (authenticated)
  // ────────────────────────────────────────────────────────────────────

  it("GET /v1/auth/me without auth → 401", async () => {
    const res = await request(server()).get("/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /v1/auth/me with access cookie returns SessionUser", async () => {
    const issued = await freshSession();

    const res = await request(server())
      .get("/v1/auth/me")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    const body = res.body as SessionUser;

    expect(res.status).toBe(200);
    expect(body.id).toBe(issued.userId);
    expect(body.email).toMatch(/@example\.com$/);
    expect(body).toHaveProperty("emailVerified");
    expect(body).toHaveProperty("createdAt");
  });

  it("GET /v1/auth/me with Bearer header works too", async () => {
    const issued = await freshSession();

    const res = await request(server())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${issued.accessToken}`);
    const body = res.body as SessionUser;

    expect(res.status).toBe(200);
    expect(body.id).toBe(issued.userId);
  });

  it("GET /v1/auth/sessions returns active sessions with current=true on the calling one", async () => {
    const issued = await freshSession();
    // Issue a second session for the same user so we can verify the
    // "current" flag picks the right one.
    const user = await users.findById(issued.userId);
    if (!user) throw new Error("seed user missing");
    const other = await coreAuth.issueSession({ user });

    const res = await request(server())
      .get("/v1/auth/sessions")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    const body = res.body as SessionSummary[];

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    const current = body.find((s) => s.current);
    expect(current?.id).toBe(issued.sessionId);
    expect(other.sessionId).not.toBe(issued.sessionId);
  });

  // ────────────────────────────────────────────────────────────────────
  // /logout + /logout-all
  // ────────────────────────────────────────────────────────────────────

  it("POST /v1/auth/logout revokes the current session and clears cookies", async () => {
    const issued = await freshSession();

    const res = await request(server())
      .post("/v1/auth/logout")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(204);
    const setCookies = res.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    expect(setCookies?.some((c) => /access_token=;/.test(c))).toBe(true);
    expect(setCookies?.some((c) => /refresh_token=;/.test(c))).toBe(true);

    const session = await prisma.session.findUnique({
      where: { id: issued.sessionId },
    });
    expect(session?.revokedAt).not.toBeNull();
  });

  it("POST /v1/auth/logout-all revokes every session of the user", async () => {
    const issued = await freshSession();
    const user = await users.findById(issued.userId);
    if (!user) throw new Error();
    const other = await coreAuth.issueSession({ user });

    const res = await request(server())
      .post("/v1/auth/logout-all")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    const body = res.body as LogoutAllResponse;

    expect(res.status).toBe(200);
    expect(body.sessionsRevoked).toBeGreaterThanOrEqual(2);

    const active = await prisma.session.count({
      where: { userId: issued.userId, revokedAt: null },
    });
    expect(active).toBe(0);
    void other;
  });

  // ────────────────────────────────────────────────────────────────────
  // DELETE /sessions/:id
  // ────────────────────────────────────────────────────────────────────

  it("DELETE /v1/auth/sessions/:id refuses sessions belonging to other users", async () => {
    const a = await freshSession();
    const b = await freshSession();

    const res = await request(server())
      .delete(`/v1/auth/sessions/${b.sessionId}`)
      .set("Cookie", [`access_token=${a.accessToken}`]);

    expect(res.status).toBe(404);
  });

  it("DELETE /v1/auth/sessions/:id revokes a specific own session", async () => {
    const issued = await freshSession();
    const user = await users.findById(issued.userId);
    if (!user) throw new Error();
    const other = await coreAuth.issueSession({ user });

    const res = await request(server())
      .delete(`/v1/auth/sessions/${other.sessionId}`)
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(204);
    const session = await prisma.session.findUnique({
      where: { id: other.sessionId },
    });
    expect(session?.revokedAt).not.toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────
  // DELETE /me
  // ────────────────────────────────────────────────────────────────────

  it("DELETE /v1/auth/me wipes the user and clears cookies", async () => {
    const issued = await freshSession();

    const res = await request(server())
      .delete("/v1/auth/me")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(204);
    const user = await prisma.user.findUnique({ where: { id: issued.userId } });
    expect(user).toBeNull();
    // Don't try to clean up after ourselves; the row is gone.
    const idx = createdUserIds.indexOf(issued.userId);
    if (idx >= 0) createdUserIds.splice(idx, 1);
  });

  // ────────────────────────────────────────────────────────────────────
  // DELETE /accounts/:provider
  // ────────────────────────────────────────────────────────────────────

  it("DELETE /v1/auth/accounts/:provider refuses if it would leave no auth method", async () => {
    // User has ONLY a Google AuthAccount, no password, no verified email/phone.
    const user = await users.createOne({
      email: `lonely-${Date.now()}@example.com`,
      // explicitly leave passwordHash, emailVerified, phoneVerified null
    });
    createdUserIds.push(user.id);
    await prisma.authAccount.create({
      data: {
        userId: user.id,
        provider: "google",
        providerId: "g-lonely-1",
        email: user.email,
      },
    });
    const issued = await coreAuth.issueSession({ user });

    const res = await request(server())
      .delete("/v1/auth/accounts/google")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(409);
  });

  it("DELETE /v1/auth/accounts/:provider succeeds when other auth methods remain", async () => {
    // Verified email → user can fall back to email-OTP.
    const user = await users.createOne({
      email: `multi-${Date.now()}@example.com`,
      emailVerified: new Date(),
    });
    createdUserIds.push(user.id);
    await prisma.authAccount.create({
      data: {
        userId: user.id,
        provider: "facebook",
        providerId: "fb-multi-1",
        email: user.email,
      },
    });
    const issued = await coreAuth.issueSession({ user });

    const res = await request(server())
      .delete("/v1/auth/accounts/facebook")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(204);
    const acct = await prisma.authAccount.findFirst({
      where: { userId: user.id, provider: "facebook" },
    });
    expect(acct).toBeNull();
  });

  it("DELETE /v1/auth/accounts/:provider rejects unknown providers", async () => {
    const issued = await freshSession();
    const res = await request(server())
      .delete("/v1/auth/accounts/myspace")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    expect(res.status).toBe(400);
  });
});
