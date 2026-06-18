import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import { CoreAuthService } from "../core-auth/core-auth.service";
import type { IssueSessionResult } from "../core-auth/core-auth.types";
import {
  OTP_PURPOSE_AUTH,
  OtpChallengeService,
} from "../otp-challenge/otp-challenge.service";

const GENERIC_INVALID_MESSAGE = "Invalid or expired code";

interface RequestInput {
  email: string;
  ip: string | null;
  userAgent: string | null;
  locale: SupportedLocale;
}

interface VerifyInput {
  challengeId: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
}

export interface VerifiedEmailOtpSession {
  tokens: v1.auth.TokenPair;
  accessTokenExpiresInSec: number;
  refreshTokenExpiresInSec: number;
}

interface FinalizedEmailAuth {
  userId: string;
  created: boolean;
  emailVerifiedNow: boolean;
  issued: IssueSessionResult;
}

@Injectable()
export class EmailOtpService {
  constructor(
    private readonly challenges: OtpChallengeService,
    private readonly coreAuth: CoreAuthService,
    private readonly audit: AuditService,
  ) {}

  async request(input: RequestInput): Promise<v1.auth.OtpChallengeMetadata> {
    return this.challenges.createOrReuse({
      purpose: OTP_PURPOSE_AUTH,
      target: input.email,
      ip: input.ip,
      locale: input.locale,
    });
  }

  async verify(input: VerifyInput): Promise<VerifiedEmailOtpSession> {
    const result = await this.challenges.verify(
      {
        challengeId: input.challengeId,
        code: input.code,
        purpose: OTP_PURPOSE_AUTH,
      },
      async (tx, challenge, now): Promise<FinalizedEmailAuth> => {
        let user = await tx.user.findUnique({
          where: { email: challenge.target },
        });
        const created = user === null;
        const emailVerifiedNow = created || user?.emailVerified === null;

        if (!user) {
          user = await tx.user.create({
            data: {
              email: challenge.target,
              emailVerified: now,
            },
          });
        } else if (emailVerifiedNow) {
          user = await tx.user.update({
            where: { id: user.id },
            data: { emailVerified: now },
          });
        }

        await tx.otpChallenge.update({
          where: { id: challenge.id },
          data: { userId: user.id },
        });

        const issued = await this.coreAuth.issueSessionInTransaction(tx, {
          user: {
            id: user.id,
            email: user.email,
            roles: user.roles,
          },
          userAgent: input.userAgent,
          ip: input.ip,
        });

        return {
          userId: user.id,
          created,
          emailVerifiedNow,
          issued,
        };
      },
    );

    if (result.kind === "invalid") {
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: result.challenge?.userId ?? null,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: {
          method: "email-otp",
          reason: result.reason,
        },
      });
      throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
    }

    if (result.value.created) {
      await this.audit.record({
        type: AuditEventType.SIGNUP,
        userId: result.value.userId,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { method: "email-otp" },
      });
    }

    if (result.value.emailVerifiedNow) {
      await this.audit.record({
        type: AuditEventType.EMAIL_VERIFIED,
        userId: result.value.userId,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { method: "email-otp" },
      });
    }

    await this.audit.record({
      type: AuditEventType.LOGIN_SUCCESS,
      userId: result.value.userId,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { method: "email-otp" },
    });

    return {
      tokens: {
        accessToken: result.value.issued.accessToken,
        refreshToken: result.value.issued.refreshToken,
      },
      accessTokenExpiresInSec: result.value.issued.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: result.value.issued.refreshTokenExpiresInSec,
    };
  }
}
