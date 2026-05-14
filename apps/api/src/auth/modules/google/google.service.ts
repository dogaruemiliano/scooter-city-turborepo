/**
 * Google Sign-in service.
 *
 * Takes an already-verified Google claim set and resolves it to a local
 * user in one of four ways (see {@link resolveUser}):
 *
 *   1. Existing `AuthAccount(provider="google", providerId=<sub>)` → repeat login.
 *   2. Same email exists, no AuthAccount, Google says email is verified → auto-link.
 *   3. Same email exists, no AuthAccount, Google did NOT verify the email → 409 Conflict.
 *   4. Nothing matches → fresh `User` + `AuthAccount`.
 *
 * The verification of the ID token itself lives in
 * `RealGoogleVerifier` / `FakeGoogleVerifier` behind the abstract
 * {@link GoogleVerifier}. Audit emission and cookie writes belong to
 * the controller — this service stays free of HTTP / Express types so
 * unit tests can call it directly.
 */
import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";

import type { AuthAccount, User } from "../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { GoogleVerifier } from "./google-verifier.interface";
import type { GoogleIdTokenClaims } from "./google-verifier.interface";

/**
 * Outcome of {@link GoogleAuthService.resolveUser}. The controller uses
 * the discriminant to decide which audit events to emit (signup +
 * link, just link, or neither).
 */
export type ResolveUserResult =
  | { kind: "existing-link"; user: User }
  | { kind: "linked-to-existing"; user: User; account: AuthAccount }
  | { kind: "new-user"; user: User; account: AuthAccount };

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GoogleVerifier) private readonly verifier: GoogleVerifier,
  ) {}

  /**
   * Verify the Google-issued ID token, throwing
   * `UnauthorizedException` on failure. Thin wrapper kept here so
   * controllers don't have to know about the verifier abstraction.
   */
  verifyIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
    return this.verifier.verify(idToken);
  }

  /**
   * Resolve a verified claim set to a local user, performing exactly
   * the writes needed for the matched case. Runs inside a single
   * transaction so a concurrent sign-in with the same email can't slip
   * a duplicate AuthAccount row past the unique constraint.
   *
   * Throws `ConflictException` when Google sends a non-verified email
   * that collides with an existing local user — that user must log in
   * via another method and link from settings instead. The constraint
   * is documented in
   * [`docs/auth/oauth-linking-rules.md`](../../../../../docs/auth/oauth-linking-rules.md).
   */
  async resolveUser(claims: GoogleIdTokenClaims): Promise<ResolveUserResult> {
    const normalizedEmail = claims.email.toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.authAccount.findUnique({
        where: {
          provider_providerId: {
            provider: "google",
            providerId: claims.sub,
          },
        },
        include: { user: true },
      });

      if (existing) {
        // Repeat login. Keep the AuthAccount.email column in sync with
        // Google's view of the address so customer-support tooling that
        // joins on `AuthAccount.email` doesn't show stale values, but
        // never touch `User.email` — that's the user's primary identity
        // and they may have changed it deliberately.
        if (existing.email !== claims.email) {
          await tx.authAccount.update({
            where: { id: existing.id },
            data: { email: claims.email },
          });
        }
        return { kind: "existing-link" as const, user: existing.user };
      }

      const byEmail = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (byEmail) {
        if (!claims.emailVerified) {
          // Refuse to link an unverified Google identity to an existing
          // local account — that would let anyone with a Google account
          // matching a victim's email take over the account simply by
          // signing in. The user must log in via another method
          // (email-OTP, Apple, …) and explicitly link from settings.
          throw new ConflictException({
            message:
              "An account with this email already exists. Sign in with your existing method and link Google from settings.",
            code: "EMAIL_NOT_VERIFIED_BY_PROVIDER",
          });
        }

        const account = await tx.authAccount.create({
          data: {
            provider: "google",
            providerId: claims.sub,
            userId: byEmail.id,
            email: claims.email,
          },
        });
        return {
          kind: "linked-to-existing" as const,
          user: byEmail,
          account,
        };
      }

      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          emailVerified: claims.emailVerified ? new Date() : null,
          firstName: this.firstName(claims.name),
          lastName: this.lastName(claims.name),
          authAccounts: {
            create: {
              provider: "google",
              providerId: claims.sub,
              email: claims.email,
            },
          },
        },
        include: { authAccounts: true },
      });

      const account = created.authAccounts.find((a) => a.provider === "google");
      if (!account) {
        // Should be impossible — we just inserted it nested. Surface as
        // a 500 with context rather than letting downstream code see
        // `undefined`.
        this.logger.error(
          { userId: created.id, claimsSub: claims.sub },
          "GoogleAuthService: AuthAccount missing after nested create",
        );
        throw new Error("Failed to create Google AuthAccount");
      }

      return { kind: "new-user" as const, user: created, account };
    });
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
