/**
 * CSRF guard end-to-end behavior.
 *
 *   - Cookie-auth POST without X-Requested-With → 403 csrf_required.
 *   - Cookie-auth POST WITH X-Requested-With → CSRF guard passes
 *     (downstream may still 401 if cookie value is junk; we just need
 *     to confirm we got past CSRF).
 *   - No-cookie POST (mobile/Bearer/curl path) → CSRF guard passes.
 *   - Safe method (GET) → CSRF guard passes regardless of header.
 *   - @SkipCsrf route (/.well-known/jwks.json) → 200 with no header.
 *
 * Probe endpoint: POST /v1/auth/email-otp/request. It's public (no JWT
 * required), accepts JSON body, and goes through the global guard chain.
 */
import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";

const PROBE_PATH = "/v1/auth/email-otp/request";
const COOKIE_VALUE = "access_token=stub.jwt.value";

describe("CSRF guard (e2e)", () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("403 when cookie present and X-Requested-With missing", async () => {
    const res = await request(server())
      .post(PROBE_PATH)
      .set("cookie", COOKIE_VALUE)
      .send({ email: "csrf-test@example.com" });
    expect(res.status).toBe(403);
    const body = res.body as { error?: { code?: string } };
    expect(body.error?.code).toBe("csrf_required");
  });

  it("passes when cookie present and X-Requested-With: fetch supplied", async () => {
    const res = await request(server())
      .post(PROBE_PATH)
      .set("cookie", COOKIE_VALUE)
      .set("x-requested-with", "fetch")
      .send({ email: "csrf-test@example.com" });
    // CSRF guard passed; downstream behavior may return 202 (sent) or
    // 429 (throttled) on a subsequent run. The only thing this test
    // cares about is that we got past the guard — anything that isn't
    // 403 csrf_required counts.
    expect(res.status).not.toBe(403);
  });

  it("passes when no auth cookies present (Bearer / mobile / curl path)", async () => {
    const res = await request(server())
      .post(PROBE_PATH)
      .send({ email: "csrf-test@example.com" });
    expect(res.status).not.toBe(403);
  });

  it("ignores safe methods (GET)", async () => {
    const res = await request(server())
      .get("/v1/auth/enabled-methods")
      .set("cookie", COOKIE_VALUE);
    expect(res.status).toBe(200);
  });

  it("does not affect @SkipCsrf routes (/.well-known/jwks.json on POST is still 404, but no 403)", async () => {
    // The JWKS route is GET-only; the guard skips safe methods anyway,
    // so this asserts the broader rule: no false positives on routes
    // that opt out of CSRF entirely. We use the GET path here.
    const res = await request(server())
      .get("/.well-known/jwks.json")
      .set("cookie", COOKIE_VALUE);
    expect(res.status).toBe(200);
  });
});
