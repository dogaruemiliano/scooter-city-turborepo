/**
 * Implements the Sign-in-with-Apple identity exchange.
 *
 * `POST /v1/auth/apple` flow:
 *
 *   1. Verify the JWT via [AppleVerifier](./apple-verifier.service.ts) →
 *      `(sub, email?, emailVerified?, isPrivateEmail?)`.
 *   2. Resolve the user using the (provider, providerId) constraint on
 *      `AuthAccount`, falling back to a same-email match when Apple
 *      tells us the email is verified.
 *   3. Mint a session via `CoreAuthService.issueSession`.
 *
 * The decision matrix lives in [docs/auth/apple-signin.md](../../../../../docs/auth/apple-signin.md);
 * the JSDoc on `resolveOrCreateUser` mirrors the same matrix so a
 * code-only reader doesn't have to leave the file.
 *
 * Apple-specific quirks the service handles explicitly:
 *
 * - **Email arrives only on the first sign-in for a given `sub`.** On
 *   subsequent sign-ins Apple omits it; we look the email up from the
 *   previously-stored `AuthAccount.email` row.
 * - **The stored email is never overwritten on subsequent sign-ins.**
 *   Apple may rotate the private-relay address; the original is the
 *   link of record and the only one our user model trusts.
 * - **Private relay (`@privaterelay.appleid.com`) is accepted.** It's a
 *   real, deliverable address Apple forwards. No domain block.
 */
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import { AuditService } from "../../../audit/audit.service";
import { AuditEventType } from "../../../audit/audit.types";
import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";
import type { User } from "../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { CoreAuthService } from "../core-auth/core-auth.service";

import {
  AppleVerifier,
  type AppleIdTokenClaims,
} from "./apple-verifier.service";

export interface AppleSignInArgs {
  idToken: string;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
  userAgent?: string | null;
  ip?: string | null;
}

export interface AppleSignInResult {
  tokens: v1.auth.TokenPair;
  accessTokenExpiresInSec: number;
  refreshTokenExpiresInSec: number;
  /** ID of the user this sign-in resolved to (new or pre-existing). */
  userId: string;
}

@Injectable()
export class AppleAuthService {
  constructor(
    private readonly verifier: AppleVerifier,
    private readonly coreAuth: CoreAuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Verify the Apple ID token, resolve or create the user, link the
   * AuthAccount on first sign-in, and issue a session.
   *
   * @throws UnauthorizedException — token verification failed, or a
   *   subsequent sign-in arrived without an existing `AuthAccount`
   *   row (data-loss case; the original first-sign-in row is missing).
   * @throws ConflictException — Apple-verified email matches an
   *   existing user whose own `emailVerified` is `null`. The client must
   *   sign in via another method first and link from settings.
   *
   * Side effects (in order):
   *  1. `audit.record({ type: SIGNUP })` if a new User was created.
   *  2. `audit.record({ type: OAUTH_LINKED })` if a new AuthAccount row
   *     was inserted (either from signup or from an auto-link).
   *  3. `audit.record({ type: LOGIN_SUCCESS })` always.
   *  4. `coreAuth.issueSession(...)` mints session + tokens.
   */
  async signIn(args: AppleSignInArgs): Promise<AppleSignInResult> {
    const claims = await this.verifyOrAudit(args);

    const resolution = await this.resolveOrCreateUser(claims, args.fullName);

    // Audit emissions before issuing the session — losing an audit row
    // after the cookies are set would lie about what happened.
    if (resolution.created) {
      await this.audit.record({
        type: AuditEventType.SIGNUP,
        userId: resolution.user.id,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: { method: "apple" },
      });
    }
    if (resolution.linked) {
      await this.audit.record({
        type: AuditEventType.OAUTH_LINKED,
        userId: resolution.user.id,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        meta: { provider: "apple" },
      });
    }

    const issued = await this.coreAuth.issueSession({
      user: { id: resolution.user.id, email: resolution.user.email },
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

  /**
   * Decision matrix (see docs/auth/apple-signin.md):
   *
   * 1. AuthAccount(apple, sub) exists → that user. Don't touch `email`
   *    (Apple may have changed the relay; the stored value is the link
   *    of record).
   * 2. Else, if Apple sent an email AND emailVerified=true AND a User
   *    with that email exists with no apple AuthAccount → auto-link.
   * 3. Else, if Apple sent an email AND emailVerified=false AND a User
   *    with that email exists → 409.
   * 4. Else, if Apple sent an email AND no User exists for it → create
   *    User (verified if Apple verified), insert AuthAccount with the
   *    email captured.
   * 5. Else (subsequent sign-in without an existing AuthAccount AND no
   *    email in the claim) → 401 (data-loss case).
   */
  private async resolveOrCreateUser(
    claims: AppleIdTokenClaims,
    fullName: AppleSignInArgs["fullName"],
  ): Promise<{ user: User; created: boolean; linked: boolean }> {
    const existingAccount = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerId: { provider: "apple", providerId: claims.sub },
      },
      include: { user: true },
    });

    if (existingAccount) {
      return { user: existingAccount.user, created: false, linked: false };
    }

    // No AuthAccount yet — we need an email to take any further action.
    if (!claims.email) {
      // Apple emits `email` only on first sign-in. Reaching this branch
      // means the first sign-in succeeded once (we should have an
      // AuthAccount) but the row is gone. Surface a generic error and
      // record a LOGIN_FAIL so support can investigate.
      await this.audit.record({
        type: AuditEventType.LOGIN_FAIL,
        userId: null,
        meta: { method: "apple", reason: "missing-email-on-resign" },
      });
      throw new UnauthorizedException(
        "Apple sign-in failed; please contact support",
      );
    }

    const normalizedEmail = claims.email;
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // The user exists by email but has no apple AuthAccount yet.
      if (claims.emailVerified !== true) {
        await this.audit.record({
          type: AuditEventType.LOGIN_FAIL,
          userId: existingUser.id,
          meta: { method: "apple", reason: "email-not-verified-by-provider" },
        });
        throw new ConflictException(
          "An account with this email exists. Sign in with another method, then link Apple from settings.",
        );
      }

      await this.prisma.authAccount.create({
        data: {
          provider: "apple",
          providerId: claims.sub,
          userId: existingUser.id,
          email: normalizedEmail,
        },
      });
      return { user: existingUser, created: false, linked: true };
    }

    // No user, no account → brand-new signup.
    const verifiedAt = claims.emailVerified === true ? new Date() : null;
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        emailVerified: verifiedAt,
        firstName: fullName?.givenName ?? null,
        lastName: fullName?.familyName ?? null,
        authAccounts: {
          create: {
            provider: "apple",
            providerId: claims.sub,
            email: normalizedEmail,
          },
        },
      },
    });

    return { user, created: true, linked: true };
  }
}
