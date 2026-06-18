import { createHmac } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import type { Prisma } from "../../../generated/prisma/client";

export const OTP_DELIVERY_QUOTA_EXCEEDED = "OTP_DELIVERY_QUOTA_EXCEEDED";

const QUOTA_BUCKET = {
  targetHour: "TARGET_HOUR",
  targetDay: "TARGET_DAY",
  ipHour: "IP_HOUR",
} as const;

interface ReserveDeliveryQuotaInput {
  target: string;
  ip: string | null;
  now: Date;
}

export interface OtpDeliveryQuotaReservation {
  bucket: string;
  subjectHash: string;
  windowStart: Date;
}

interface QuotaDefinition extends OtpDeliveryQuotaReservation {
  windowEnd: Date;
  limit: number;
}

@Injectable()
export class OtpDeliveryQuotaService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async reserve(
    tx: Prisma.TransactionClient,
    input: ReserveDeliveryQuotaInput,
  ): Promise<OtpDeliveryQuotaReservation[]> {
    const definitions = this.definitions(input);
    const exceededWindowEnds: Date[] = [];

    for (const definition of definitions) {
      const row = await tx.otpDeliveryQuota.upsert({
        where: {
          bucket_subjectHash_windowStart: {
            bucket: definition.bucket,
            subjectHash: definition.subjectHash,
            windowStart: definition.windowStart,
          },
        },
        create: {
          bucket: definition.bucket,
          subjectHash: definition.subjectHash,
          windowStart: definition.windowStart,
          windowEnd: definition.windowEnd,
          count: 1,
        },
        update: {
          count: { increment: 1 },
        },
      });

      if (row.count > definition.limit) {
        exceededWindowEnds.push(row.windowEnd);
      }
    }

    if (exceededWindowEnds.length > 0) {
      const retryAfterSec = Math.max(
        ...exceededWindowEnds.map((windowEnd) =>
          Math.max(
            1,
            Math.ceil((windowEnd.getTime() - input.now.getTime()) / 1000),
          ),
        ),
      );
      throw new OtpDeliveryQuotaExceededException(retryAfterSec);
    }

    return definitions.map(({ bucket, subjectHash, windowStart }) => ({
      bucket,
      subjectHash,
      windowStart,
    }));
  }

  async release(
    tx: Prisma.TransactionClient,
    reservations: OtpDeliveryQuotaReservation[],
  ): Promise<void> {
    for (const reservation of reservations) {
      const key = {
        bucket: reservation.bucket,
        subjectHash: reservation.subjectHash,
        windowStart: reservation.windowStart,
      };

      await tx.otpDeliveryQuota.updateMany({
        where: {
          ...key,
          count: { gt: 0 },
        },
        data: {
          count: { decrement: 1 },
        },
      });
      await tx.otpDeliveryQuota.deleteMany({
        where: {
          ...key,
          count: { lte: 0 },
        },
      });
    }
  }

  private definitions(input: ReserveDeliveryQuotaInput): QuotaDefinition[] {
    const hour = this.hourWindow(input.now);
    const day = this.dayWindow(input.now);
    const targetHash = this.subjectHash(
      "target",
      input.target.trim().toLowerCase(),
    );
    const ipHash = this.subjectHash("ip", this.normalizeIp(input.ip));

    return [
      {
        bucket: QUOTA_BUCKET.targetHour,
        subjectHash: targetHash,
        windowStart: hour.start,
        windowEnd: hour.end,
        limit: this.env.OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR,
      },
      {
        bucket: QUOTA_BUCKET.targetDay,
        subjectHash: targetHash,
        windowStart: day.start,
        windowEnd: day.end,
        limit: this.env.OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY,
      },
      {
        bucket: QUOTA_BUCKET.ipHour,
        subjectHash: ipHash,
        windowStart: hour.start,
        windowEnd: hour.end,
        limit: this.env.OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR,
      },
    ];
  }

  private subjectHash(kind: "target" | "ip", value: string): string {
    return createHmac("sha256", this.env.OTP_HMAC_SECRET)
      .update(`otp-delivery-quota:v1:${kind}:${value}`)
      .digest("hex");
  }

  private normalizeIp(ip: string | null): string {
    const normalized = ip?.trim().toLowerCase();
    if (!normalized) return "unknown";
    return normalized.startsWith("::ffff:")
      ? normalized.slice("::ffff:".length)
      : normalized;
  }

  private hourWindow(now: Date): { start: Date; end: Date } {
    const start = new Date(now);
    start.setUTCMinutes(0, 0, 0);
    return {
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
    };
  }

  private dayWindow(now: Date): { start: Date; end: Date } {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return {
      start,
      end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    };
  }
}

export class OtpDeliveryQuotaExceededException extends HttpException {
  constructor(retryAfterSec: number) {
    super(
      {
        code: OTP_DELIVERY_QUOTA_EXCEEDED,
        message: "Too many code requests. Try again later.",
        details: { retryAfterSec },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
