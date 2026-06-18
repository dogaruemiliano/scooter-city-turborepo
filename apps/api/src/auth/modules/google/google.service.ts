/**
 * Google Sign-in service.
 *
 * Verifies a Google ID token, resolves it to a local user, records the
 * audit trail, and issues a first-party session.
 *
 * Resolution follows four cases:
 *
 *   1. Existing `AuthAccount(provider="google", providerId=<sub>)` → repeat login.
 *   2. Same email exists, no AuthAccount, Google says email is verified → auto-link.
 *   3. No AuthAccount and Google did not verify the email → email OTP
 *      challenge, with no local-user lookup before the proof succeeds.
 *   4. Verified email with no local match → fresh `User` + `AuthAccount`.
 *
 * The verification of the ID token itself lives behind
 * {@link GoogleVerifier}. Cookie writes remain in the controller; this
 * service stays free of HTTP / Express types.
 */
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import { CoreAuthService } from "../core-auth/core-auth.service";
import {
  OAuthAccountResolver,
  type OAuthAccountResolution,
} from "../core-auth/oauth-account-resolver.service";
import { GENERIC_OAUTH_SIGN_IN_MESSAGE } from "../core-auth/oauth-sign-in.constants";
import { OAuthEmailVerificationService } from "../oauth-email-verification/oauth-email-verification.service";
import { GoogleVerifier } from "./google-verifier.interface";
import type { GoogleIdTokenClaims } from "./google-verifier.interface";

export interface GoogleSignInArgs {
  idToken: string;
  userAgent?: string | null;
  ip?: string | null;
  locale?: SupportedLocale;
}

export type GoogleSignInResult =
  | {
      kind: "authenticated";
      tokens: v1.auth.TokenPair;
      accessTokenExpiresInSec: number;
      refreshTokenExpiresInSec: number;
      userId: string;
    }
  | {
      kind: "verification-required";
      challenge: v1.auth.OAuthEmailVerificationRequired;
    };

@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(GoogleVerifier) private readonly verifier: GoogleVerifier,
    private readonly coreAuth: CoreAuthService,
    private readonly accountResolver: OAuthAccountResolver,
    private readonly emailVerification: OAuthEmailVerificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Verify the Google token, resolve or create the user, audit the
   * outcome, and issue a first-party session.
   */
  async signIn(args: GoogleSignInArgs): Promise<GoogleSignInResult> {
    const claims = await this.verifyOrAudit(args);

    const resolution = await this.resolveUser(claims);

    if (resolution.kind === "unverified-email") {
      return {
        kind: "verification-required",
        challenge: await this.emailVerification.createChallenge({
          provider: "google",
          providerId: claims.sub,
          email: claims.email,
          firstName: this.firstName(claims.name),
          lastName: this.lastName(claims.name),
          ip: args.ip ?? null,
          locale: args.locale,
        }),
      };
    }

    if (resolution.kind === "missing-email") {
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: null,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: {
          method: "google",
          reason: "missing-email-without-link",
        },
      });
      throw new UnauthorizedException(GENERIC_OAUTH_SIGN_IN_MESSAGE);
    }

    if (resolution.kind === "new-user") {
      await this.audit.record({
        type: AuditEventType.SIGNUP,
        userId: resolution.user.id,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: { method: "google" },
      });
    }
    if (resolution.kind !== "existing-link") {
      await this.audit.record({
        type: AuditEventType.OAUTH_LINKED,
        userId: resolution.user.id,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: { provider: "google" },
      });
    }

    const issued = await this.coreAuth.issueSession({
      user: {
        id: resolution.user.id,
        email: resolution.user.email,
        roles: resolution.user.roles,
      },
      userAgent: args.userAgent ?? null,
      ip: args.ip ?? null,
    });

    await this.audit.record({
      type: AuditEventType.LOGIN_SUCCESS,
      userId: resolution.user.id,
      ip: args.ip ?? null,
      userAgent: args.userAgent ?? null,
      meta: { method: "google" },
    });

    return {
      kind: "authenticated",
      tokens: {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
      },
      accessTokenExpiresInSec: issued.accessTokenExpiresInSec,
      refreshTokenExpiresInSec: issued.refreshTokenExpiresInSec,
      userId: resolution.user.id,
    };
  }

  private async resolveUser(
    claims: GoogleIdTokenClaims,
  ): Promise<OAuthAccountResolution> {
    return this.accountResolver.resolve({
      provider: "google",
      providerId: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      firstName: this.firstName(claims.name),
      lastName: this.lastName(claims.name),
      existingEmailPolicy: "sync",
    });
  }

  private async verifyOrAudit(
    args: GoogleSignInArgs,
  ): Promise<GoogleIdTokenClaims> {
    try {
      return await this.verifier.verify(args.idToken);
    } catch (error) {
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: null,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: { method: "google", reason: "verifier-rejected" },
      });
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid Google ID token");
    }
  }

  private firstName(fullName: string | undefined): string | null {
    if (!fullName) return null;
    const trimmed = fullName.trim();
    if (!trimmed) return null;
    const space = trimmed.indexOf(" ");
    return space === -1 ? trimmed : trimmed.slice(0, space);
  }

  private lastName(fullName: string | undefined): string | null {
    if (!fullName) return null;
    const trimmed = fullName.trim();
    const space = trimmed.indexOf(" ");
    if (space === -1) return null;
    const rest = trimmed.slice(space + 1).trim();
    return rest || null;
  }
}
