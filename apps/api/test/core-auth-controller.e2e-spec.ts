/**
 * HTTP-level E2E tests for the `/v1/auth/...` endpoints exposed by
 * the core auth controllers.
 *
 * Each test boots the full `AppModule` so the global `JwtAuthGuard`,
 * cookie parser, exception filter, and URI versioning are all active —
 * we're testing the wire as the web client sees it.
 *
 * Cleanup pattern: tests that create a user push the ID onto
 * `createdUserIds`; `afterAll` removes them. The seed users
 * (`seed-user-*`) are left alone.
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
import { CoreAuthService } from "../src/auth/modules/core-auth/core-auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { UsersService } from "../src/users/users.service";

interface IssuedSession {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
}

describe("Core auth HTTP surface (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersService;
  let coreAuth: CoreAuthService;

  const createdUserIds: string[] = [];

  const server = () => app.getHttpServer() as Server;

  /**
   * Thin wrapper around supertest. Every request gets `X-Requested-With:
   * fetch` so cookie-bearing mutations pass the global `CsrfGuard`. Safe
   * methods receive the header too, which is harmless — the guard skips
   * GET/HEAD/OPTIONS regardless.
   */
  type RequestBuilder = ReturnType<ReturnType<typeof request>["get"]>;
  const req = (): {
    get: (path: string) => RequestBuilder;
    post: (path: string) => RequestBuilder;
    put: (path: string) => RequestBuilder;
    patch: (path: string) => RequestBuilder;
    delete: (path: string) => RequestBuilder;
  } => {
    const base = request(server());
    const tag = (b: RequestBuilder) => b.set("x-requested-with", "fetch");
    return {
      get: (p) => tag(base.get(p)),
      post: (p) => tag(base.post(p)),
      put: (p) => tag(base.put(p)),
      patch: (p) => tag(base.patch(p)),
      delete: (p) => tag(base.delete(p)),
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    // ZodValidationPipe is registered globally via APP_PIPE in AppModule
    // (see apps/api/src/app.module.ts). Don't add a useGlobalPipes() here
    // — it would shadow the APP_PIPE provider with a class-validator pipe
    // that doesn't understand nestjs-zod DTOs.
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

  async function freshSession(): Promise<IssuedSession> {
    const user = await users.createOne({
      email: `ctrl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
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

  it("GET /v1/auth/enabled-methods returns enabled IDs in canonical order", async () => {
    const res = await req().get("/v1/auth/enabled-methods");
    const body = v1.auth.enabledAuthMethodsSchema.parse(res.body);

    expect(res.status).toBe(200);
    expect(body).toEqual({ methods: ["emailOtp", "google"] });
  });

  // ────────────────────────────────────────────────────────────────────
  // /refresh (public)
  // ────────────────────────────────────────────────────────────────────

  it("POST /v1/auth/refresh with no token → 401", async () => {
    const res = await req().post("/v1/auth/refresh").send({});
    expect(res.status).toBe(401);
  });

  it("POST /v1/auth/refresh with body refreshToken returns new pair and sets cookies", async () => {
    const issued = await freshSession();

    const res = await req()
      .post("/v1/auth/refresh")
      .send({ refreshToken: issued.refreshToken });
    const body = res.body as v1.auth.TokenPair;

    expect(res.status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(issued.refreshToken);
    expect(res.headers["x-ratelimit-limit"]).toBe("10000");
    expect(res.headers["x-ratelimit-limit-login-ip"]).toBeUndefined();
    expect(res.headers["x-ratelimit-limit-otp-request-burst"]).toBeUndefined();

    const setCookies = res.headers["set-cookie"] as unknown as
      | string[]
      | undefined;
    expect(setCookies?.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(setCookies?.some((c) => c.startsWith("refresh_token="))).toBe(true);
  });

  it("POST /v1/auth/refresh with cookie (web flow) rotates the session", async () => {
    const issued = await freshSession();

    const res = await req()
      .post("/v1/auth/refresh")
      .set("Cookie", [`refresh_token=${issued.refreshToken}`])
      .send({});
    const body = res.body as v1.auth.TokenPair;

    expect(res.status).toBe(200);
    expect(body.refreshToken).not.toBe(issued.refreshToken);
  });

  // ────────────────────────────────────────────────────────────────────
  // /me + /sessions (authenticated)
  // ────────────────────────────────────────────────────────────────────

  it("GET /v1/auth/me without auth → 401", async () => {
    const res = await req().get("/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /v1/auth/me with access cookie returns SessionUser", async () => {
    const issued = await freshSession();

    const res = await req()
      .get("/v1/auth/me")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    const body = res.body as v1.auth.SessionUser;

    expect(res.status).toBe(200);
    expect(body.id).toBe(issued.userId);
    expect(body.email).toMatch(/@example\.com$/);
    expect(body).toHaveProperty("emailVerified");
    expect(body).toHaveProperty("createdAt");
    expect(body.linkedProviders).toEqual([]);
  });

  it("PATCH /v1/auth/me updates and returns the editable profile", async () => {
    const issued = await freshSession();

    const res = await req()
      .patch("/v1/auth/me")
      .set("Cookie", [`access_token=${issued.accessToken}`])
      .send({ firstName: "  Ada  ", lastName: "Lovelace" });
    const body = v1.auth.sessionUserSchema.parse(res.body);

    expect(res.status).toBe(200);
    expect(body.firstName).toBe("Ada");
    expect(body.lastName).toBe("Lovelace");

    const user = await prisma.user.findUnique({
      where: { id: issued.userId },
    });
    expect(user?.firstName).toBe("Ada");
    expect(user?.lastName).toBe("Lovelace");
  });

  it("PATCH /v1/auth/me rejects blank profile names", async () => {
    const issued = await freshSession();

    const res = await req()
      .patch("/v1/auth/me")
      .set("Cookie", [`access_token=${issued.accessToken}`])
      .send({ firstName: "   " });

    expect(res.status).toBe(400);
  });

  it("GET /v1/auth/me with Bearer header works too", async () => {
    const issued = await freshSession();

    const res = await req()
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${issued.accessToken}`);
    const body = res.body as v1.auth.SessionUser;

    expect(res.status).toBe(200);
    expect(body.id).toBe(issued.userId);
  });

  it("GET /v1/auth/me returns linked OAuth providers once each", async () => {
    const issued = await freshSession();
    await prisma.authAccount.createMany({
      data: [
        {
          userId: issued.userId,
          provider: "google",
          providerId: `google-primary-${issued.userId}`,
        },
        {
          userId: issued.userId,
          provider: "google",
          providerId: `google-secondary-${issued.userId}`,
        },
      ],
    });

    const res = await req()
      .get("/v1/auth/me")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    const body = v1.auth.sessionUserSchema.parse(res.body);

    expect(res.status).toBe(200);
    expect(body.linkedProviders).toEqual(["google"]);
  });

  it("rejects a refresh token used as an access credential", async () => {
    const issued = await freshSession();

    const res = await req()
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${issued.refreshToken}`);

    expect(res.status).toBe(401);
  });

  it("GET /v1/auth/sessions returns active sessions with current=true on the calling one", async () => {
    const issued = await freshSession();
    // Issue a second session for the same user so we can verify the
    // "current" flag picks the right one.
    const user = await users.findById(issued.userId);
    if (!user) throw new Error("seed user missing");
    const other = await coreAuth.issueSession({ user });

    const res = await req()
      .get("/v1/auth/sessions")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    const body = res.body as v1.auth.SessionSummary[];

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

    const res = await req()
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

    const res = await req()
      .post("/v1/auth/logout-all")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    const body = res.body as v1.auth.LogoutAllResult;

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

    const res = await req()
      .delete(`/v1/auth/sessions/${b.sessionId}`)
      .set("Cookie", [`access_token=${a.accessToken}`]);

    expect(res.status).toBe(404);
  });

  it("DELETE /v1/auth/sessions/:id revokes a specific own session", async () => {
    const issued = await freshSession();
    const user = await users.findById(issued.userId);
    if (!user) throw new Error();
    const other = await coreAuth.issueSession({ user });

    const res = await req()
      .delete(`/v1/auth/sessions/${other.sessionId}`)
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(204);
    const session = await prisma.session.findUnique({
      where: { id: other.sessionId },
    });
    expect(session?.revokedAt).not.toBeNull();
  });

  it("DELETE /v1/auth/sessions/:id is idempotent for an owned session", async () => {
    const issued = await freshSession();
    const user = await users.findById(issued.userId);
    if (!user) throw new Error();
    const other = await coreAuth.issueSession({ user });
    await coreAuth.revokeSession(other.sessionId, issued.userId);

    const res = await req()
      .delete(`/v1/auth/sessions/${other.sessionId}`)
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(204);
  });

  // ────────────────────────────────────────────────────────────────────
  // DELETE /me
  // ────────────────────────────────────────────────────────────────────

  it("DELETE /v1/auth/me wipes the user and clears cookies", async () => {
    const issued = await freshSession();

    const res = await req()
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
    // User has ONLY a Google AuthAccount, no verified email/phone.
    const user = await users.createOne({
      email: `lonely-${Date.now()}@example.com`,
      // explicitly leave emailVerified, phoneVerified null
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

    const res = await req()
      .delete("/v1/auth/accounts/google")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(409);
  });

  it("does not count a verified phone as a fallback when SMS auth is disabled", async () => {
    const user = await users.createOne({
      email: `phone-only-${Date.now()}@example.com`,
      phone: `+407${Math.floor(10000000 + Math.random() * 89999999)}`,
      phoneVerified: new Date(),
    });
    createdUserIds.push(user.id);
    await prisma.authAccount.create({
      data: {
        userId: user.id,
        provider: "google",
        providerId: `google-phone-only-${user.id}`,
        email: user.email,
      },
    });
    const issued = await coreAuth.issueSession({ user });

    const res = await req()
      .delete("/v1/auth/accounts/google")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(409);
  });

  it("DELETE /v1/auth/accounts/:provider removes every link for that provider when another auth method remains", async () => {
    // Verified email → user can fall back to email-OTP.
    const user = await users.createOne({
      email: `multi-${Date.now()}@example.com`,
      emailVerified: new Date(),
    });
    createdUserIds.push(user.id);
    await prisma.authAccount.createMany({
      data: [
        {
          userId: user.id,
          provider: "apple",
          providerId: `apple-multi-1-${user.id}`,
          email: user.email,
        },
        {
          userId: user.id,
          provider: "apple",
          providerId: `apple-multi-2-${user.id}`,
          email: user.email,
        },
      ],
    });
    const issued = await coreAuth.issueSession({ user });

    const res = await req()
      .delete("/v1/auth/accounts/apple")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(204);
    const accountCount = await prisma.authAccount.count({
      where: { userId: user.id, provider: "apple" },
    });
    expect(accountCount).toBe(0);
  });

  it("DELETE /v1/auth/accounts/:provider returns 404 when the provider is not linked", async () => {
    const issued = await freshSession();

    const res = await req()
      .delete("/v1/auth/accounts/google")
      .set("Cookie", [`access_token=${issued.accessToken}`]);

    expect(res.status).toBe(404);
  });

  it("parallel provider unlinks cannot remove both remaining auth methods", async () => {
    const user = await users.createOne({
      email: `parallel-unlink-${Date.now()}@example.com`,
    });
    createdUserIds.push(user.id);
    await prisma.authAccount.createMany({
      data: [
        {
          userId: user.id,
          provider: "google",
          providerId: `google-parallel-${user.id}`,
          email: user.email,
        },
        {
          userId: user.id,
          provider: "apple",
          providerId: `apple-parallel-${user.id}`,
          email: user.email,
        },
      ],
    });
    const issued = await coreAuth.issueSession({ user });
    const cookie = [`access_token=${issued.accessToken}`];

    const [googleResult, appleResult] = await Promise.all([
      req().delete("/v1/auth/accounts/google").set("Cookie", cookie),
      req().delete("/v1/auth/accounts/apple").set("Cookie", cookie),
    ]);

    expect([googleResult.status, appleResult.status].sort()).toEqual([
      204, 409,
    ]);
    const remainingAccounts = await prisma.authAccount.count({
      where: { userId: user.id },
    });
    expect(remainingAccounts).toBe(1);
  });

  it("DELETE /v1/auth/accounts/:provider rejects unknown providers", async () => {
    const issued = await freshSession();
    const res = await req()
      .delete("/v1/auth/accounts/myspace")
      .set("Cookie", [`access_token=${issued.accessToken}`]);
    expect(res.status).toBe(400);
  });
});
