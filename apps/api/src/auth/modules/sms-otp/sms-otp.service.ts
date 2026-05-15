/**
 * SMS-OTP service.
 *
 * Two public methods:
 *
 * - `request({ phone, ip, userAgent })` — issues a one-time code by SMS
 *   if `phone` matches a real user. Returns the constant
 *   `{ status: "sent" }` shape regardless of whether the phone was known
 *   (anti-enumeration: no row, no SMS, but matched latency is added on
 *   the unknown path).
 * - `verify({ phone, code, ip, userAgent })` — locates the user, picks
 *   the most recent unused, non-expired `OtpToken` (channel `SMS`,
 *   purpose `AUTH`), constant-time compares the hash, and (on success)
 *   marks the row used + issues a fresh session via
 *   `CoreAuthService.issueSession`. Wrong-code attempts increment
 *   `attemptsCount` on the row; once
 *   `attemptsCount >= OTP_MAX_ATTEMPTS` every further attempt is refused
 *   without re-checking.
 *
 * Audit emissions:
 *
 * - `LOGIN_SUCCESS` on every successful verify (`meta.method: "sms-otp"`).
 * - `SIGNUP` on the user's first-ever successful login (was unverified +
 *   has no prior `LOGIN_SUCCESS` audit row).
 * - `LOGIN_FAIL` with a `reason` discriminator on every failed verify.
 *
 * Mirror of `EmailOtpService` — same patterns, different channel
 * (`SMS`), different verification column (`phoneVerified` instead of
 * `emailVerified`), different delivery transport (`SmsService` instead
 * of `MailerService`).
 */
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import ms from "ms";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import { PrismaService } from "../../../prisma/prisma.service";
import { SmsService } from "../../../sms/sms.service";
import { UsersService } from "../../../users/users.service";
import { setAuthCookies } from "../../utils/cookies";
import { hashOtp, safeEqualHex } from "../../utils/hash";
import { generateOtpCode } from "../../utils/otp-code";
import { CoreAuthService } from "../core-auth/core-auth.service";
import type { TokenPair } from "../core-auth/core-auth.types";

import type { Response } from "express";

const OTP_CHANNEL_SMS = "SMS";
const OTP_PURPOSE_AUTH = "AUTH";
const GENERIC_INVALID_MESSAGE = "Invalid or expired code";

interface RequestInput {
  phone: string;
  ip: string | null;
  userAgent: string | null;
}

interface VerifyInput {
  phone: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
  res: Response;
}

@Injectable()
export class SmsOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly coreAuth: CoreAuthService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Issues an SMS-OTP row + sends the code if the phone matches a real
   * user. Otherwise burns matched-latency work via
   * `coreAuth.performDummyHashCompare()` so the response time does not
   * disclose whether the number is known.
   */
  async request(input: RequestInput): Promise<void> {
    const user = await this.users.findByPhone(input.phone);
    if (!user) {
      // Anti-enumeration: match the work the success branch performs.
      // We cannot insert a row or send an SMS (would change DB/outbox
      // state for a non-existent user) so we approximate by burning the
      // same ~100ms bcrypt CPU the credentials path consumes elsewhere.
      await this.coreAuth.performDummyHashCompare();
      return;
    }

    const code = generateOtpCode({
      nodeEnv: this.env.NODE_ENV,
      length: this.env.OTP_LENGTH,
    });
    const codeHash = hashOtp(code, this.env.OTP_HMAC_SECRET);
    const expiresAt = new Date(
      Date.now() + ms(this.env.OTP_TTL as ms.StringValue),
    );

    await this.prisma.otpToken.create({
      data: {
        userId: user.id,
        channel: OTP_CHANNEL_SMS,
        purpose: OTP_PURPOSE_AUTH,
        codeHash,
        expiresAt,
      },
    });

    await this.sms.send({
      to: input.phone,
      body: `Your sign-in code is ${code}. It expires in ${this.env.OTP_TTL}.`,
    });
  }

  /**
   * Verifies a presented code. On match: mark the row used, set
   * `phoneVerified` if this is the user's first verify, audit
   * appropriately, issue a fresh session, and write cookies.
   *
   * Throws `UnauthorizedException` with a generic message on every
   * failure path (unknown phone, no live row, expired row, wrong code,
   * too many attempts). The caller must not distinguish reasons.
   */
  async verify(input: VerifyInput): Promise<TokenPair> {
    const user = await this.users.findByPhone(input.phone);
    if (!user) {
      await this.coreAuth.performDummyHashCompare();
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: null,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { method: "sms-otp", reason: "unknown-phone" },
      });
      throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
    }

    const row = await this.prisma.otpToken.findFirst({
      where: {
        userId: user.id,
        channel: OTP_CHANNEL_SMS,
        purpose: OTP_PURPOSE_AUTH,
        used: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!row || row.expiresAt.getTime() <= Date.now()) {
      await this.coreAuth.performDummyHashCompare();
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { method: "sms-otp", reason: "expired" },
      });
      throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
    }

    if (row.attemptsCount >= this.env.OTP_MAX_ATTEMPTS) {
      // Row is dead: don't re-check the hash, don't bump the counter.
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { method: "sms-otp", reason: "invalid-code" },
      });
      throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
    }

    const presentedHash = hashOtp(input.code, this.env.OTP_HMAC_SECRET);
    if (!safeEqualHex(presentedHash, row.codeHash)) {
      await this.prisma.otpToken.update({
        where: { id: row.id },
        data: { attemptsCount: { increment: 1 } },
      });
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { method: "sms-otp", reason: "invalid-code" },
      });
      throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
    }

    // ── Happy path ─────────────────────────────────────────────────────
    await this.prisma.otpToken.update({
      where: { id: row.id },
      data: { used: true },
    });

    const wasUnverified = user.phoneVerified === null;
    if (wasUnverified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: new Date() },
      });

      // First-ever successful sign-in: no prior LOGIN_SUCCESS row AND
      // the phone was previously unverified. The check on prior
      // LOGIN_SUCCESS guards against re-emitting SIGNUP if a user
      // un-verified themselves somehow.
      const priorSuccesses = await this.prisma.auditEvent.count({
        where: { userId: user.id, type: AuditEventType.LOGIN_SUCCESS },
      });
      if (priorSuccesses === 0) {
        await this.audit.record({
          type: AuditEventType.SIGNUP,
          userId: user.id,
          ip: input.ip,
          userAgent: input.userAgent,
          meta: { method: "sms-otp" },
        });
      }
    }

    const issued = await this.coreAuth.issueSession({
      user: { id: user.id, email: user.email },
      userAgent: input.userAgent,
      ip: input.ip,
    });

    setAuthCookies(input.res, this.env, {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      accessTokenExpiresInSec: issued.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: issued.refreshTokenExpiresInSec,
    });

    await this.audit.record({
      type: AuditEventType.LOGIN_SUCCESS,
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { method: "sms-otp" },
    });

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      accessTokenExpiresInSec: issued.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: issued.refreshTokenExpiresInSec,
    };
  }
}
