/**
 * Implements the Sign-in-with-Apple identity exchange.
 *
 * `POST /v1/auth/apple` flow:
 *
 *   1. Verify the JWT via [AppleVerifier](./apple-verifier.service.ts) →
 *      `(sub, email?, emailVerified?, isPrivateEmail?)`.
 *   2. Resolve the user through the shared OAuth account resolver.
 *   3. Mint a session via `CoreAuthService.issueSession`.
 *
 * The decision matrix lives in [docs/auth/apple-signin.md](../../../../../docs/auth/apple-signin.md);
 * provider-specific errors and audit semantics stay in this service.
 *
 * Apple-specific quirks the service handles explicitly:
 *
 * - **Email claims are optional.** Existing links resolve by Apple's
 *   stable, app-scoped `sub`; repeat login does not require an email.
 * - **The stored email is never overwritten on repeat sign-ins.**
 *   Apple may rotate the private-relay address; the original is the
 *   link of record and the only one our user model trusts.
 * - **Private relay (`@privaterelay.appleid.com`) is accepted.** It's a
 *   real, deliverable address Apple forwards. No domain block.
 */
import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";
import type { SupportedLocale } from "@repo/i18n";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import { CoreAuthService } from "../core-auth/core-auth.service";
import { OAuthAccountResolver } from "../core-auth/oauth-account-resolver.service";
import { GENERIC_OAUTH_SIGN_IN_MESSAGE } from "../core-auth/oauth-sign-in.constants";
import { OAuthEmailVerificationService } from "../oauth-email-verification/oauth-email-verification.service";

import {
  AppleVerifier,
  type AppleIdTokenClaims,
} from "./apple-verifier.service";

export interface AppleSignInArgs {
  idToken: string;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
  userAgent?: string | null;
  ip?: string | null;
  locale?: SupportedLocale;
}

export type AppleSignInResult =
  | {
      kind: "authenticated";
      tokens: v1.auth.TokenPair;
      accessTokenExpiresInSec: number;
      refreshTokenExpiresInSec: number;
      /** ID of the user this sign-in resolved to (new or pre-existing). */
      userId: string;
    }
  | {
      kind: "verification-required";
      challenge: v1.auth.OAuthEmailVerificationRequired;
    };

@Injectable()
export class AppleAuthService {
  constructor(
    private readonly verifier: AppleVerifier,
    private readonly coreAuth: CoreAuthService,
    private readonly accountResolver: OAuthAccountResolver,
    private readonly emailVerification: OAuthEmailVerificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Verify the Apple ID token, resolve or create the user, link the
   * AuthAccount on first successful link, and issue a session.
   *
   * @throws UnauthorizedException — token verification failed, or an
   *   unlinked identity did not provide any email to verify.
   *
   * Side effects (in order):
   *  1. `audit.record({ type: SIGNUP })` if a new User was created.
   *  2. `audit.record({ type: OAUTH_LINKED })` if a new AuthAccount row
   *     was inserted (either from signup or from an auto-link).
   *  3. `coreAuth.issueSession(...)` mints session + tokens.
   *  4. `audit.record({ type: LOGIN_SUCCESS })` always.
   */
  async signIn(args: AppleSignInArgs): Promise<AppleSignInResult> {
    const claims = await this.verifyOrAudit(args);

    const resolution = await this.accountResolver.resolve({
      provider: "apple",
      providerId: claims.sub,
      email: claims.email ?? null,
      emailVerified: claims.emailVerified === true,
      firstName: args.fullName?.givenName ?? null,
      lastName: args.fullName?.familyName ?? null,
      existingEmailPolicy: "preserve",
    });

    if (resolution.kind === "unverified-email") {
      if (!claims.email) {
        throw new UnauthorizedException(GENERIC_OAUTH_SIGN_IN_MESSAGE);
      }
      return {
        kind: "verification-required",
        challenge: await this.emailVerification.createChallenge({
          provider: "apple",
          providerId: claims.sub,
          email: claims.email,
          firstName: args.fullName?.givenName ?? null,
          lastName: args.fullName?.familyName ?? null,
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
          method: "apple",
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
        meta: { method: "apple" },
      });
    }
    if (resolution.kind !== "existing-link") {
      await this.audit.record({
        type: AuditEventType.OAUTH_LINKED,
        userId: resolution.user.id,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: { provider: "apple" },
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
      meta: { method: "apple" },
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

  private async verifyOrAudit(
    args: AppleSignInArgs,
  ): Promise<AppleIdTokenClaims> {
    try {
      return await this.verifier.verify(args.idToken);
    } catch (error) {
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: null,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: { method: "apple", reason: "verifier-rejected" },
      });
      throw error;
    }
  }
}
