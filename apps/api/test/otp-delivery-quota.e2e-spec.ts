import { INestApplication, type Type, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { v1 } from "@repo/api-shared";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { FakeGoogleVerifier } from "../src/auth/modules/google/fake-google-verifier.service";
import { GoogleVerifier } from "../src/auth/modules/google/google-verifier.interface";
import { ENV } from "../src/config/config.module";
import { loadEnv, type Env } from "../src/config/env";
import { SpyMailerService } from "../src/mailer/impls/spy-mailer.service";
import {
  MailerService,
  type MailerMessage,
} from "../src/mailer/mailer.service";
import { PrismaService } from "../src/prisma/prisma.service";

interface QuotaLimits {
  targetHour: number;
  targetDay: number;
  ipHour: number;
}

describe("OTP delivery quotas (e2e)", () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService | undefined;
  let mailer: SpyMailerService | undefined;
  let verifier: FakeGoogleVerifier | undefined;

  const server = (): Server => {
    if (!app) throw new Error("Test application is not running");
    return app.getHttpServer() as Server;
  };

  async function boot(
    limits: QuotaLimits,
    mailerType: Type<MailerService> = SpyMailerService,
    resetQuotaState = true,
  ): Promise<void> {
    const env: Env = {
      ...loadEnv(),
      OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR: limits.targetHour,
      OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY: limits.targetDay,
      OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR: limits.ipHour,
      THROTTLE_GLOBAL_PER_IP_PER_MIN: 10_000,
      THROTTLE_OTP_REQUESTS_PER_IP_PER_MIN: 10_000,
      THROTTLE_LOGIN_PER_IP_PER_MIN: 10_000,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ENV)
      .useValue(env)
      .overrideProvider(MailerService)
      .useClass(mailerType)
      .overrideProvider(GoogleVerifier)
      .useClass(FakeGoogleVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.use(cookieParser());
    await app.init();
    const prismaService = app.get(PrismaService);
    prisma = prismaService;
    mailer = app.get(MailerService);
    verifier = app.get(GoogleVerifier);

    if (resetQuotaState) {
      await prismaService.otpChallenge.deleteMany({
        where: { target: { endsWith: "@quota.test" } },
      });
      await prismaService.otpDeliveryQuota.deleteMany();
    }
  }

  afterEach(async () => {
    if (prisma) {
      await prisma.otpChallenge.deleteMany({
        where: { target: { endsWith: "@quota.test" } },
      });
      await prisma.otpDeliveryQuota.deleteMany();
    }
    if (app) await app.close();
    app = undefined;
    prisma = undefined;
    mailer = undefined;
    verifier = undefined;
  });

  it("counts only actual deliveries and returns a generic 429 with Retry-After", async () => {
    await boot({ targetHour: 2, targetDay: 2, ipHour: 100 });
    const email = uniqueEmail("target");

    const initial = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(initial.status).toBe(202);
    const initialBody = v1.auth.otpChallengeMetadataSchema.parse(initial.body);
    const challengeId = initialBody.challengeId;

    const early = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId });
    expect(early.status).toBe(202);
    expect(mailer?.getOutbox()).toHaveLength(1);

    await prisma?.otpChallenge.update({
      where: { id: challengeId },
      data: { nextSendAt: new Date(Date.now() - 1) },
    });
    const allowed = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId });
    expect(allowed.status).toBe(202);
    expect(mailer?.getOutbox()).toHaveLength(2);

    await prisma?.otpChallenge.update({
      where: { id: challengeId },
      data: { nextSendAt: new Date(Date.now() - 1) },
    });
    const blocked = await request(server())
      .post(v1.auth.ROUTES.otp.resend)
      .send({ challengeId });

    expect(blocked.status).toBe(429);
    const blockedBody = blocked.body as {
      error: {
        code: string;
        message: string;
        details: { retryAfterSec: number };
        requestId: string;
      };
    };
    const expectedMessage = `Too many requests. Try again in ${blockedBody.error.details.retryAfterSec} seconds.`;
    expect(blockedBody).toEqual({
      error: {
        code: "OTP_DELIVERY_QUOTA_EXCEEDED",
        message: expectedMessage,
        details: {
          retryAfterSec: expect.any(Number) as number,
        },
        requestId: expect.any(String) as string,
      },
    });
    expect(Number(blocked.headers["retry-after"])).toBe(
      blockedBody.error.details.retryAfterSec,
    );
    expect(
      await prisma?.otpChallenge.findUniqueOrThrow({
        where: { id: challengeId },
      }),
    ).toMatchObject({ sentCount: 2 });

    const quotas = await prisma?.otpDeliveryQuota.findMany();
    expect(quotas).toHaveLength(3);
    expect(quotas?.map((row) => row.count)).toEqual([2, 2, 2]);
    expect(
      quotas?.every(
        (row) =>
          row.subjectHash.length === 64 &&
          !row.subjectHash.includes(email) &&
          !row.subjectHash.includes("127.0.0.1"),
      ),
    ).toBe(true);
  });

  it("shares target quotas between email auth and OAuth email verification", async () => {
    await boot({ targetHour: 1, targetDay: 10, ipHour: 100 });
    const email = uniqueEmail("oauth-shared");

    const emailResponse = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(emailResponse.status).toBe(202);

    const idToken = "quota-google-token-padded";
    verifier?.register(idToken, {
      sub: `quota-google-${Date.now()}`,
      email,
      emailVerified: false,
    });
    const googleResponse = await request(server())
      .post(v1.auth.ROUTES.google)
      .send({ idToken });

    expect(googleResponse.status).toBe(429);
    const googleError = googleResponse.body as {
      error: { code: string };
    };
    expect(googleError.error.code).toBe("OTP_DELIVERY_QUOTA_EXCEEDED");
    expect(mailer?.getOutbox()).toHaveLength(1);
  });

  it("persists target quotas across API restarts", async () => {
    const limits = { targetHour: 1, targetDay: 10, ipHour: 100 };
    const email = uniqueEmail("restart");
    await boot(limits);

    const first = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(first.status).toBe(202);
    const firstBody = v1.auth.otpChallengeMetadataSchema.parse(first.body);
    await prisma?.otpChallenge.update({
      where: { id: firstBody.challengeId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    await app?.close();
    app = undefined;
    prisma = undefined;
    mailer = undefined;
    verifier = undefined;

    await boot(limits, SpyMailerService, false);
    const afterRestart = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(afterRestart.status).toBe(429);
  });

  it("atomically permits one concurrent delivery at the IP boundary", async () => {
    await boot({ targetHour: 100, targetDay: 100, ipHour: 1 });

    const responses = await Promise.all([
      request(server())
        .post(v1.auth.ROUTES.emailOtp.request)
        .send({ email: uniqueEmail("ip-a") }),
      request(server())
        .post(v1.auth.ROUTES.emailOtp.request)
        .send({ email: uniqueEmail("ip-b") }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 429,
    ]);
    expect(mailer?.getOutbox()).toHaveLength(1);
    expect(
      await prisma?.otpDeliveryQuota.findFirstOrThrow({
        where: { bucket: "IP_HOUR" },
      }),
    ).toMatchObject({ count: 1 });
  });

  it("releases quota and challenge reservations when SMTP fails", async () => {
    await boot(
      { targetHour: 1, targetDay: 1, ipHour: 1 },
      FailOnceMailerService,
    );
    const email = uniqueEmail("mail-failure");
    const failingMailer = mailer as FailOnceMailerService;
    failingMailer.failNext();

    const failed = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(failed.status).toBe(500);
    expect(await prisma?.otpDeliveryQuota.count()).toBe(0);
    expect(await prisma?.otpChallenge.count({ where: { target: email } })).toBe(
      0,
    );

    const retry = await request(server())
      .post(v1.auth.ROUTES.emailOtp.request)
      .send({ email });
    expect(retry.status).toBe(202);
    expect(failingMailer.getOutbox()).toHaveLength(1);
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
    .slice(2, 8)}@quota.test`;
}
