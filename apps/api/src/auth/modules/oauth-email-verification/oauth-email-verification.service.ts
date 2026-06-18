import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import type { User } from "../../../generated/prisma/client";
import { CoreAuthService } from "../core-auth/core-auth.service";
import type { IssueSessionResult } from "../core-auth/core-auth.types";
import {
  OAuthAccountResolver,
  type ResolvedOAuthAccount,
} from "../core-auth/oauth-account-resolver.service";
import {
  OTP_PURPOSE_OAUTH_EMAIL_VERIFY,
  OtpChallengeService,
} from "../otp-challenge/otp-challenge.service";

const GENERIC_INVALID_MESSAGE = "Invalid or expired code";

export interface CreateOAuthEmailVerificationInput {
  provider: v1.auth.OAuthProvider;
  providerId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  ip: string | null;
}

export interface VerifyOAuthEmailVerificationInput {
  challengeId: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
}

export interface VerifiedOAuthEmailSession {
  tokens: v1.auth.TokenPair;
  accessTokenExpiresInSec: number;
  refreshTokenExpiresInSec: number;
}

interface FinalizedOAuthEmailAuth {
  provider: v1.auth.OAuthProvider;
  resolution: ResolvedOAuthAccount;
  user: User;
  emailVerifiedNow: boolean;
  issued: IssueSessionResult;
}

@Injectable()
export class OAuthEmailVerificationService {
  constructor(
    private readonly challenges: OtpChallengeService,
    private readonly accountResolver: OAuthAccountResolver,
    private readonly coreAuth: CoreAuthService,
    private readonly audit: AuditService,
  ) {}

  createChallenge(
    input: CreateOAuthEmailVerificationInput,
  ): Promise<v1.auth.OtpChallengeMetadata> {
    return this.challenges.createOrReuse({
      purpose: OTP_PURPOSE_OAUTH_EMAIL_VERIFY,
      target: input.email,
      ip: input.ip,
      provider: input.provider,
      providerId: input.providerId,
      firstName: input.firstName,
      lastName: input.lastName,
    });
  }

  async verify(
    input: VerifyOAuthEmailVerificationInput,
  ): Promise<VerifiedOAuthEmailSession> {
    const result = await this.challenges.verify(
      {
        challengeId: input.challengeId,
        code: input.code,
        purpose: OTP_PURPOSE_OAUTH_EMAIL_VERIFY,
      },
      async (tx, challenge, now): Promise<FinalizedOAuthEmailAuth> => {
        const provider = this.parseProvider(challenge.provider);
        const resolution =
          await this.accountResolver.resolveVerifiedInTransaction(tx, {
            provider,
            providerId: challenge.providerId as string,
            email: challenge.target,
            firstName: challenge.firstName,
            lastName: challenge.lastName,
            existingEmailPolicy: provider === "google" ? "sync" : "preserve",
          });

        let user = resolution.user;
        const emailVerifiedNow =
          user.email.toLowerCase() === challenge.target &&
          user.emailVerified === null;
        if (emailVerifiedNow) {
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
          provider,
          resolution,
          user,
          emailVerifiedNow: emailVerifiedNow || resolution.kind === "new-user",
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
          method: "oauth-email-verification",
          provider: result.challenge?.provider ?? "unknown",
          reason: result.reason,
        },
      });
      throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
    }

    await this.recordSuccessAudits(result.value, input);
    await this.audit.record({
      type: AuditEventType.LOGIN_SUCCESS,
      userId: result.value.user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: {
        method: result.value.provider,
        verification: "email-otp",
      },
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

  private async recordSuccessAudits(
    result: FinalizedOAuthEmailAuth,
    input: VerifyOAuthEmailVerificationInput,
  ): Promise<void> {
    if (result.resolution.kind === "new-user") {
      await this.audit.record({
        type: AuditEventType.SIGNUP,
        userId: result.user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { method: result.provider, verification: "email-otp" },
      });
    }

    if (result.resolution.kind !== "existing-link") {
      await this.audit.record({
        type: AuditEventType.OAUTH_LINKED,
        userId: result.user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: { provider: result.provider, verification: "email-otp" },
      });
    }

    if (result.emailVerifiedNow) {
      await this.audit.record({
        type: AuditEventType.EMAIL_VERIFIED,
        userId: result.user.id,
        ip: input.ip,
        userAgent: input.userAgent,
        meta: {
          method: "oauth-email-verification",
          provider: result.provider,
        },
      });
    }
  }

  private parseProvider(provider: string | null): v1.auth.OAuthProvider {
    if (provider === "google" || provider === "apple") return provider;
    throw new UnauthorizedException(GENERIC_INVALID_MESSAGE);
  }
}
