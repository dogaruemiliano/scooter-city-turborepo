process.env.AUTH_APPLE_ENABLED = "true";
process.env.APPLE_SERVICE_ID = "com.example.throttling";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { AppleVerifier } from "../src/auth/modules/apple/apple-verifier.service";
import { FakeGoogleVerifier } from "../src/auth/modules/google/fake-google-verifier.service";
import { GoogleVerifier } from "../src/auth/modules/google/google-verifier.interface";
import { ENV } from "../src/config/config.module";
import { loadEnv, type Env } from "../src/config/env";
import { SpyMailerService } from "../src/mailer/impls/spy-mailer.service";
import { MailerService } from "../src/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";

import { FakeAppleVerifier } from "./fakes/apple-verifier.fake";

describe("Request throttling layers (e2e)", () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService | undefined;

  const server = (): Server => {
    if (!app) throw new Error("Test application is not running");
    return app.getHttpServer() as Server;
  };

  async function boot(overrides: Partial<Env>): Promise<void> {
    const env: Env = {
      ...loadEnv(),
      OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR: 10_000,
      OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY: 10_000,
      OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR: 10_000,
      THROTTLE_GLOBAL_PER_IP_PER_MIN: 10_000,
      THROTTLE_OTP_REQUESTS_PER_IP_PER_MIN: 10_000,
      THROTTLE_LOGIN_PER_IP_PER_MIN: 10_000,
      ...overrides,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ENV)
      .useValue(env)
      .overrideProvider(MailerService)
      .useClass(SpyMailerService)
      .overrideProvider(GoogleVerifier)
      .useClass(FakeGoogleVerifier)
      .overrideProvider(AppleVerifier)
      .useClass(FakeAppleVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    const prismaService = app.get(PrismaService);
    prisma = prismaService;
    await prismaService.otpChallenge.deleteMany({
      where: { target: { endsWith: "@throttle.test" } },
    });
    await prismaService.otpDeliveryQuota.deleteMany();
  }

  afterEach(async () => {
    if (prisma) {
      await prisma.otpChallenge.deleteMany({
        where: { target: { endsWith: "@throttle.test" } },
      });
      await prisma.otpDeliveryQuota.deleteMany();
    }
    if (app) await app.close();
    app = undefined;
    prisma = undefined;
  });

  it("applies the OTP burst limit only to request and resend routes", async () => {
    await boot({ THROTTLE_OTP_REQUESTS_PER_IP_PER_MIN: 2 });

    const first = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: uniqueEmail("otp-first") });
    const second = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: uniqueEmail("otp-second") });
    const third = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: uniqueEmail("otp-third") });

    expect([first.status, second.status, third.status]).toEqual([
      202, 202, 429,
    ]);
    expect(first.headers["x-ratelimit-limit-otp-request-burst"]).toBe("2");

    const firstBody = v1.auth.otpChallengeMetadataSchema.parse(first.body);
    const challengeId = firstBody.challengeId;
    const resendStatuses: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await request(server())
        .post(v1.auth.ROUTES.otp.resend)
        .send({ challengeId });
      resendStatuses.push(response.status);
    }
    expect(resendStatuses).toEqual([202, 202, 429]);

    const verifyStatuses: number[] = [];
    const refreshStatuses: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      verifyStatuses.push(
        (
          await request(server())
            .post(v1.auth.ROUTES.emailOtp.verify)
            .send({ challengeId: crypto.randomUUID(), code: "000000" })
        ).status,
      );
      refreshStatuses.push(
        (
          await request(server())
            .post(v1.auth.ROUTES.refresh)
            .set("x-requested-with", "fetch")
            .send({})
        ).status,
      );
    }
    expect(verifyStatuses).toEqual([401, 401, 401]);
    expect(refreshStatuses).toEqual([401, 401, 401]);
  });

  it("applies the login burst independently to Google and Apple", async () => {
    await boot({ THROTTLE_LOGIN_PER_IP_PER_MIN: 2 });

    const googleStatuses: number[] = [];
    const appleStatuses: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      googleStatuses.push(
        (
          await request(server())
            .post(v1.auth.ROUTES.google)
            .send({ idToken: `invalid-google-token-${index}` })
        ).status,
      );
      appleStatuses.push(
        (
          await request(server())
            .post(v1.auth.ROUTES.apple)
            .send({ idToken: `invalid-apple-token-${index}` })
        ).status,
      );
    }

    expect(googleStatuses).toEqual([401, 401, 429]);
    expect(appleStatuses).toEqual([401, 401, 429]);
  });

  it("applies a relaxed per-endpoint global limit while exempting health and JWKS", async () => {
    await boot({ THROTTLE_GLOBAL_PER_IP_PER_MIN: 2 });

    const first = await request(server()).get(v1.auth.ROUTES.enabledMethods);
    const second = await request(server()).get(v1.auth.ROUTES.enabledMethods);
    const blocked = await request(server()).get(v1.auth.ROUTES.enabledMethods);

    expect([first.status, second.status, blocked.status]).toEqual([
      200, 200, 429,
    ]);
    expect(first.headers["x-ratelimit-limit"]).toBe("2");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);

    const separateEndpoint = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email: uniqueEmail("global") });
    expect(separateEndpoint.status).toBe(202);

    for (let index = 0; index < 3; index += 1) {
      const health = await request(server()).get("/healthz");
      expect(health.status).not.toBe(429);
      expect(health.headers["x-ratelimit-limit"]).toBeUndefined();
      expect(
        (await request(server()).get("/.well-known/jwks.json")).status,
      ).toBe(200);
    }
  });
});

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@throttle.test`;
}
