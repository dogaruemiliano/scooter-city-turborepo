import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import ms from "ms";

import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { Prisma, type OtpChallenge } from "../../../generated/prisma/client";
import { MailerService } from "../../../mailer/mailer.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { hashOtp, safeEqualHex } from "../../utils/hash";
import { deriveOtpCode } from "../../utils/otp-code";

import {
  OtpDeliveryQuotaService,
  type OtpDeliveryQuotaReservation,
} from "./otp-delivery-quota.service";

export const OTP_CHANNEL_EMAIL = "EMAIL";
export const OTP_PURPOSE_AUTH = "AUTH";
export const OTP_PURPOSE_OAUTH_EMAIL_VERIFY = "OAUTH_EMAIL_VERIFY";

const GENERIC_INVALID_MESSAGE = "Invalid or expired code";
const MAX_TRANSACTION_ATTEMPTS = 3;
const FIRST_RESEND_DELAY_MS = 30_000;
const SECOND_RESEND_DELAY_MS = 120_000;
const LATER_RESEND_DELAY_MS = 300_000;

export interface OtpChallengeMetadata {
  status: "verification_required";
  challengeId: string;
  expiresInSec: number;
  resendAfterSec: number;
}

export interface CreateEmailChallengeInput {
  purpose: typeof OTP_PURPOSE_AUTH | typeof OTP_PURPOSE_OAUTH_EMAIL_VERIFY;
  target: string;
  ip: string | null;
  userId?: string | null;
  provider?: string | null;
  providerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface VerifyChallengeInput {
  challengeId: string;
  code: string;
  purpose: typeof OTP_PURPOSE_AUTH | typeof OTP_PURPOSE_OAUTH_EMAIL_VERIFY;
}

export type VerifyChallengeResult<T> =
  | {
      kind: "success";
      challenge: OtpChallenge;
      value: T;
    }
  | {
      kind: "invalid";
      reason:
        | "missing"
        | "wrong-purpose"
        | "used-expired-or-locked"
        | "invalid-code"
        | "already-used-or-expired";
      challenge: OtpChallenge | null;
    };

interface DeliveryReservation {
  challenge: OtpChallenge;
  shouldSend: boolean;
  created: boolean;
  quotaReservations: OtpDeliveryQuotaReservation[];
  previousDelivery: {
    sentCount: number;
    lastSentAt: Date;
    nextSendAt: Date;
  } | null;
}

@Injectable()
export class OtpChallengeService {
  private readonly logger = new Logger(OtpChallengeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly deliveryQuotas: OtpDeliveryQuotaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createOrReuse(
    input: CreateEmailChallengeInput,
  ): Promise<OtpChallengeMetadata> {
    const normalized = this.normalizeInput(input);
    const reservation = await this.runSerializable((tx) =>
      this.reserveInitialDelivery(tx, normalized),
    );

    await this.deliverOrRollback(reservation);
    return this.toMetadata(reservation.challenge);
  }

  async resend(
    challengeId: string,
    ip: string | null,
  ): Promise<OtpChallengeMetadata> {
    const reservation = await this.runSerializable((tx) =>
      this.reserveResend(tx, challengeId, ip),
    );

    if (!reservation) {
      throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
    }

    await this.deliverOrRollback(reservation);
    return this.toMetadata(reservation.challenge);
  }

  async verify<T>(
    input: VerifyChallengeInput,
    finalize: (
      tx: Prisma.TransactionClient,
      challenge: OtpChallenge,
      now: Date,
    ) => Promise<T>,
  ): Promise<VerifyChallengeResult<T>> {
    return this.runSerializable(async (tx) => {
      const challenge = await tx.otpChallenge.findUnique({
        where: { id: input.challengeId },
      });

      if (!challenge) {
        return {
          kind: "invalid" as const,
          reason: "missing" as const,
          challenge: null,
        };
      }
      if (challenge.purpose !== input.purpose) {
        return {
          kind: "invalid" as const,
          reason: "wrong-purpose" as const,
          challenge,
        };
      }

      const now = new Date();
      if (
        challenge.usedAt !== null ||
        challenge.expiresAt <= now ||
        challenge.attemptsCount >= this.env.OTP_MAX_ATTEMPTS
      ) {
        return {
          kind: "invalid" as const,
          reason: "used-expired-or-locked" as const,
          challenge,
        };
      }

      const presentedHash = hashOtp(input.code, this.env.OTP_HMAC_SECRET);
      if (!safeEqualHex(presentedHash, challenge.codeHash)) {
        await tx.otpChallenge.updateMany({
          where: {
            id: challenge.id,
            usedAt: null,
            attemptsCount: { lt: this.env.OTP_MAX_ATTEMPTS },
          },
          data: { attemptsCount: { increment: 1 } },
        });
        return {
          kind: "invalid" as const,
          reason: "invalid-code" as const,
          challenge,
        };
      }

      const claimed = await tx.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          purpose: input.purpose,
          usedAt: null,
          expiresAt: { gt: now },
          attemptsCount: { lt: this.env.OTP_MAX_ATTEMPTS },
        },
        data: {
          usedAt: now,
          activeKey: null,
        },
      });
      if (claimed.count !== 1) {
        return {
          kind: "invalid" as const,
          reason: "already-used-or-expired" as const,
          challenge,
        };
      }

      const claimedChallenge: OtpChallenge = {
        ...challenge,
        usedAt: now,
        activeKey: null,
      };
      const value = await finalize(tx, claimedChallenge, now);
      return {
        kind: "success" as const,
        challenge: claimedChallenge,
        value,
      };
    });
  }

  private async reserveInitialDelivery(
    tx: Prisma.TransactionClient,
    input: Required<Pick<CreateEmailChallengeInput, "purpose" | "target">> &
      Omit<CreateEmailChallengeInput, "purpose" | "target">,
  ): Promise<DeliveryReservation> {
    const now = new Date();
    const activeKey = this.activeKey(input);
    const existing = await tx.otpChallenge.findUnique({
      where: { activeKey },
    });

    if (existing && this.isReusable(existing, input, now)) {
      return this.reserveExistingDelivery(tx, existing, now, input.ip);
    }

    if (existing) {
      await tx.otpChallenge.updateMany({
        where: { id: existing.id, activeKey },
        data: { activeKey: null },
      });
    }

    const id = randomUUID();
    const code = this.codeFor(id);
    const expiresAt = new Date(
      now.getTime() + ms(this.env.OTP_TTL as ms.StringValue),
    );
    const nextSendAt = new Date(now.getTime() + FIRST_RESEND_DELAY_MS);
    const challenge = await tx.otpChallenge.create({
      data: {
        id,
        activeKey,
        channel: OTP_CHANNEL_EMAIL,
        purpose: input.purpose,
        target: input.target,
        userId: input.userId ?? null,
        provider: input.provider ?? null,
        providerId: input.providerId ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        codeHash: hashOtp(code, this.env.OTP_HMAC_SECRET),
        expiresAt,
        lastSentAt: now,
        nextSendAt,
      },
    });
    const quotaReservations = await this.deliveryQuotas.reserve(tx, {
      target: challenge.target,
      ip: input.ip,
      now,
    });

    return {
      challenge,
      shouldSend: true,
      created: true,
      quotaReservations,
      previousDelivery: null,
    };
  }

  private async reserveResend(
    tx: Prisma.TransactionClient,
    challengeId: string,
    ip: string | null,
  ): Promise<DeliveryReservation | null> {
    const challenge = await tx.otpChallenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge || !this.isActive(challenge, new Date())) return null;

    return this.reserveExistingDelivery(tx, challenge, new Date(), ip);
  }

  private async reserveExistingDelivery(
    tx: Prisma.TransactionClient,
    challenge: OtpChallenge,
    now: Date,
    ip: string | null,
  ): Promise<DeliveryReservation> {
    if (challenge.nextSendAt > now) {
      return {
        challenge,
        shouldSend: false,
        created: false,
        quotaReservations: [],
        previousDelivery: null,
      };
    }

    const sentCount = challenge.sentCount + 1;
    const nextSendAt = new Date(now.getTime() + this.resendDelayMs(sentCount));
    const reserved = await tx.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        sentCount,
        lastSentAt: now,
        nextSendAt,
      },
    });
    const quotaReservations = await this.deliveryQuotas.reserve(tx, {
      target: challenge.target,
      ip,
      now,
    });

    return {
      challenge: reserved,
      shouldSend: true,
      created: false,
      quotaReservations,
      previousDelivery: {
        sentCount: challenge.sentCount,
        lastSentAt: challenge.lastSentAt,
        nextSendAt: challenge.nextSendAt,
      },
    };
  }

  private async deliverOrRollback(
    reservation: DeliveryReservation,
  ): Promise<void> {
    if (!reservation.shouldSend) return;

    try {
      await this.send(reservation.challenge);
    } catch (error) {
      try {
        await this.runSerializable(async (tx) => {
          if (reservation.created) {
            await tx.otpChallenge.deleteMany({
              where: {
                id: reservation.challenge.id,
                usedAt: null,
                sentCount: reservation.challenge.sentCount,
              },
            });
          } else if (reservation.previousDelivery) {
            await tx.otpChallenge.updateMany({
              where: {
                id: reservation.challenge.id,
                usedAt: null,
                sentCount: reservation.challenge.sentCount,
                lastSentAt: reservation.challenge.lastSentAt,
              },
              data: reservation.previousDelivery,
            });
          }

          await this.deliveryQuotas.release(tx, reservation.quotaReservations);
        });
      } catch (rollbackError) {
        this.logger.error(
          "Failed to release OTP delivery reservation after mail failure",
          rollbackError instanceof Error
            ? rollbackError.stack
            : String(rollbackError),
        );
      }
      throw error;
    }
  }

  private async send(challenge: OtpChallenge): Promise<void> {
    const code = this.codeFor(challenge.id);
    const oauthVerification =
      challenge.purpose === OTP_PURPOSE_OAUTH_EMAIL_VERIFY;

    await this.mailer.send({
      to: challenge.target,
      subject: oauthVerification ? "Verify your email" : "Your sign-in code",
      text: oauthVerification
        ? `Your email verification code is ${code}. It expires in ${this.env.OTP_TTL}.`
        : `Your sign-in code is ${code}. It expires in ${this.env.OTP_TTL}.`,
    });
  }

  private normalizeInput(
    input: CreateEmailChallengeInput,
  ): Required<Pick<CreateEmailChallengeInput, "purpose" | "target">> &
    Omit<CreateEmailChallengeInput, "purpose" | "target"> {
    return {
      ...input,
      target: input.target.trim().toLowerCase(),
    };
  }

  private activeKey(
    input: Required<Pick<CreateEmailChallengeInput, "purpose" | "target">> &
      Omit<CreateEmailChallengeInput, "purpose" | "target">,
  ): string {
    if (input.purpose === OTP_PURPOSE_AUTH) {
      return `${OTP_CHANNEL_EMAIL}:${input.purpose}:${input.target}`;
    }
    return `${OTP_CHANNEL_EMAIL}:${input.purpose}:${input.provider}:${input.providerId}`;
  }

  private isReusable(
    challenge: OtpChallenge,
    input: Required<Pick<CreateEmailChallengeInput, "purpose" | "target">> &
      Omit<CreateEmailChallengeInput, "purpose" | "target">,
    now: Date,
  ): boolean {
    return (
      this.isActive(challenge, now) &&
      challenge.target === input.target &&
      challenge.provider === (input.provider ?? null) &&
      challenge.providerId === (input.providerId ?? null)
    );
  }

  private isActive(challenge: OtpChallenge, now: Date): boolean {
    return (
      challenge.activeKey !== null &&
      challenge.usedAt === null &&
      challenge.expiresAt > now &&
      challenge.attemptsCount < this.env.OTP_MAX_ATTEMPTS
    );
  }

  private codeFor(challengeId: string): string {
    return deriveOtpCode({
      challengeId,
      secret: this.env.OTP_HMAC_SECRET,
      nodeEnv: this.env.NODE_ENV,
      length: this.env.OTP_LENGTH,
    });
  }

  private resendDelayMs(sentCount: number): number {
    if (sentCount === 1) return FIRST_RESEND_DELAY_MS;
    if (sentCount === 2) return SECOND_RESEND_DELAY_MS;
    return LATER_RESEND_DELAY_MS;
  }

  private toMetadata(challenge: OtpChallenge): OtpChallengeMetadata {
    const now = Date.now();
    const expiresInSec = Math.max(
      1,
      Math.ceil((challenge.expiresAt.getTime() - now) / 1000),
    );
    const nextActionAt = Math.min(
      challenge.nextSendAt.getTime(),
      challenge.expiresAt.getTime(),
    );

    return {
      status: "verification_required",
      challengeId: challenge.id,
      expiresInSec,
      resendAfterSec: Math.max(0, Math.ceil((nextActionAt - now) / 1000)),
    };
  }

  private async runSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002") &&
          attempt < MAX_TRANSACTION_ATTEMPTS;
        if (!retryable) throw error;
      }
    }

    throw new Error("OTP challenge transaction retry budget exhausted");
  }
}
