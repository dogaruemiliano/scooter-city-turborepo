import type { Env } from "../../../config/env";
import { Prisma, type OtpChallenge } from "../../../generated/prisma/client";
import { SpyMailerService } from "../../../mailer/impls/spy-mailer.service";
import type { PrismaService } from "../../../prisma/prisma.service";
import { hashOtp } from "../../utils/hash";
import { OTP_PURPOSE_AUTH, OtpChallengeService } from "./otp-challenge.service";
import type { OtpDeliveryQuotaService } from "./otp-delivery-quota.service";

describe("OTP verification transaction retries", () => {
  const secret = "test-otp-secret";
  const input = {
    challengeId: "test-challenge",
    code: "000000",
    purpose: OTP_PURPOSE_AUTH,
  } as const;

  function setup() {
    const now = new Date();
    const challenge: OtpChallenge = {
      id: input.challengeId,
      activeKey: "EMAIL:AUTH:test@example.com",
      channel: "EMAIL",
      purpose: OTP_PURPOSE_AUTH,
      target: "test@example.com",
      userId: null,
      provider: null,
      providerId: null,
      firstName: null,
      lastName: null,
      codeHash: hashOtp(input.code, secret),
      expiresAt: new Date(now.getTime() + 60_000),
      usedAt: null,
      attemptsCount: 0,
      sentCount: 1,
      lastSentAt: now,
      nextSendAt: now,
      createdAt: now,
    };
    const findUnique = jest.fn().mockResolvedValue(challenge);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      otpChallenge: { findUnique, updateMany },
    };
    const transaction = jest.fn(
      (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(tx as unknown as Prisma.TransactionClient),
    );
    const service = new OtpChallengeService(
      { $transaction: transaction } as unknown as PrismaService,
      new SpyMailerService(),
      {} as OtpDeliveryQuotaService,
      { OTP_MAX_ATTEMPTS: 5, OTP_HMAC_SECRET: secret } as Env,
    );
    const finalize = jest.fn().mockResolvedValue("session");
    return { service, transaction, findUnique, updateMany, finalize };
  }

  function conflict(code: string) {
    return new Prisma.PrismaClientKnownRequestError("Transaction conflict", {
      code,
      clientVersion: "7.8.0",
    });
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each(["P2034", "P2002"])(
    "backs off and retries the entire transaction when finalize raises %s",
    async (code) => {
      const { service, transaction, findUnique, updateMany, finalize } =
        setup();
      finalize.mockRejectedValueOnce(conflict(code));
      const pending = service.verify(input, finalize);

      await jest.advanceTimersByTimeAsync(9);
      expect(transaction).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({
        kind: "success",
        value: "session",
      });
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(findUnique).toHaveBeenCalledTimes(2);
      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(finalize).toHaveBeenCalledTimes(2);
      expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    },
  );

  it("retries conflicts when claiming the OTP before calling finalize", async () => {
    const { service, updateMany, finalize } = setup();
    updateMany.mockRejectedValueOnce(conflict("P2034"));
    const pending = service.verify(input, finalize);
    await jest.advanceTimersByTimeAsync(9);
    expect(finalize).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ kind: "success" });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it("waits 10 then 20 ms and preserves the final error when retries are exhausted", async () => {
    const { service, transaction, finalize } = setup();
    const error = conflict("P2034");
    finalize.mockRejectedValue(error);
    const assertion = expect(service.verify(input, finalize)).rejects.toBe(
      error,
    );
    await jest.advanceTimersByTimeAsync(10);
    expect(transaction).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(19);
    expect(transaction).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    await assertion;
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([conflict("P2025"), new Error("Unexpected failure")])(
    "does not retry non-retryable errors (%s)",
    async (error) => {
      const { service, transaction, finalize } = setup();
      finalize.mockRejectedValue(error);
      await expect(service.verify(input, finalize)).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});

describe("OTP admission and anti-enumeration", () => {
  it.each([null, "DISABLED", "SUSPENDED", "INVITED"])(
    "returns generic metadata without email or challenge creation for %s admission",
    async (loginStatus) => {
      const create = jest.fn();
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([]),
        user: {
          findUnique: jest.fn().mockResolvedValue(
            loginStatus === null
              ? null
              : {
                  id: "user",
                  email: "member@example.com",
                  deletedAt: null,
                  loginStatus,
                },
          ),
        },
        userInvitation: { findFirst: jest.fn().mockResolvedValue(null) },
        otpChallenge: { create },
      };
      const prisma = {
        $transaction: (operation: (client: unknown) => Promise<unknown>) =>
          operation(tx),
      } as unknown as PrismaService;
      const mailer = new SpyMailerService();
      const service = new OtpChallengeService(
        prisma,
        mailer,
        {} as OtpDeliveryQuotaService,
        { OTP_TTL: "10m" } as Env,
      );
      await expect(
        service.createOrReuse({
          purpose: OTP_PURPOSE_AUTH,
          target: "member@example.com",
          ip: null,
        }),
      ).resolves.toEqual({
        status: "verification_required",
        challengeId: expect.any(String) as string,
        expiresInSec: 600,
        resendAfterSec: 30,
      });
      expect(create).not.toHaveBeenCalled();
      expect(tx.$executeRaw).toHaveBeenCalledWith([
        "SELECT pg_advisory_xact_lock_shared(726001)",
      ]);
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.$queryRaw.mock.invocationCallOrder[0],
      );
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.user.findUnique.mock.invocationCallOrder[0],
      );
      expect(mailer.getOutbox()).toHaveLength(0);
    },
  );

  it("suppresses resend after an account is suspended", async () => {
    const now = new Date();
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user",
          email: "member@example.com",
          deletedAt: null,
          loginStatus: "SUSPENDED",
        }),
      },
      otpChallenge: {
        findUnique: jest.fn().mockResolvedValue({
          id: "challenge",
          activeKey: "active",
          target: "member@example.com",
          usedAt: null,
          expiresAt: new Date(now.getTime() + 60_000),
          attemptsCount: 0,
        }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: (operation: (client: unknown) => Promise<unknown>) =>
        operation(tx),
    } as unknown as PrismaService;
    const mailer = new SpyMailerService();
    const service = new OtpChallengeService(
      prisma,
      mailer,
      {} as OtpDeliveryQuotaService,
      { OTP_TTL: "10m", OTP_MAX_ATTEMPTS: 5 } as Env,
    );
    await expect(service.resend("challenge", null)).resolves.toMatchObject({
      status: "verification_required",
      challengeId: "challenge",
    });
    expect(tx.otpChallenge.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledWith([
      "SELECT pg_advisory_xact_lock_shared(726001)",
    ]);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.otpChallenge.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.findUnique.mock.invocationCallOrder[0],
    );
    expect(mailer.getOutbox()).toHaveLength(0);
  });
});
