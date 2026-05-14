/**
 * Verifies Apple-issued identity tokens.
 *
 * Apple's ID token is a JWT signed by the rotating JWKS at
 * `https://appleid.apple.com/auth/keys`. The audience MUST match either
 * the Service ID (web Sign in with Apple JS) or the iOS Bundle ID
 * (native SDK) configured for this app. The issuer MUST be
 * `https://appleid.apple.com`.
 *
 * The abstract class is what controllers/services inject. The real
 * implementation uses `jose`'s `createRemoteJWKSet`, which keeps an
 * internal cache and handles Apple's key rotation transparently. Tests
 * override the binding with a `FakeAppleVerifier` that returns canned
 * claims for canned tokens.
 *
 * @see docs/auth/apple-signin.md
 */
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { Logger } from "nestjs-pino";

import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";

/**
 * Subset of Apple's identity-token claims this app reads. Apple includes
 * a few more (`auth_time`, `nonce_supported`, etc.) but they're irrelevant
 * to a token-exchange flow.
 *
 * Notes on shape:
 * - `sub` is per-app (keyed by team + service-id), stable across logins.
 * - `email` is present ONLY on the very first sign-in for a given `sub`.
 * - `email_verified` and `is_private_email` arrive as either booleans or
 *   the strings `"true"` / `"false"` depending on the SDK. The verifier
 *   normalizes both to booleans.
 */
export interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  isPrivateEmail?: boolean;
  audience: string;
}

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
/** ±5 seconds clock skew tolerance — matches Apple's documented guidance. */
const CLOCK_TOLERANCE_SEC = 5;

export abstract class AppleVerifier {
  /**
   * Verifies the JWT signature, issuer, audience, and lifetime against
   * Apple's published JWKS, then returns the normalized claim set.
   *
   * @throws UnauthorizedException when verification fails for any reason
   *   (bad signature, wrong issuer, audience mismatch, expiry, claim
   *   shape). The error message is intentionally generic — exact failure
   *   details go to the server log only.
   */
  abstract verify(idToken: string): Promise<AppleIdTokenClaims>;
}

@Injectable()
export class RealAppleVerifier implements AppleVerifier {
  private readonly jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  private readonly audiences: string[];

  constructor(
    @Inject(ENV) env: Env,
    private readonly logger: Logger,
  ) {
    this.audiences = [env.APPLE_SERVICE_ID, env.APPLE_BUNDLE_ID].filter(
      (a): a is string => typeof a === "string" && a.length > 0,
    );
  }

  async verify(idToken: string): Promise<AppleIdTokenClaims> {
    if (this.audiences.length === 0) {
      // Module wouldn't be loaded without one of these set; defensive log.
      this.logger.error(
        "AppleVerifier invoked without APPLE_SERVICE_ID or APPLE_BUNDLE_ID configured",
      );
      throw new UnauthorizedException("Apple sign-in is not configured");
    }
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, this.jwks, {
        issuer: APPLE_ISSUER,
        audience: this.audiences,
        clockTolerance: CLOCK_TOLERANCE_SEC,
      });
      payload = result.payload;
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        "Apple identity-token verification failed",
      );
      throw new UnauthorizedException("Invalid Apple identity token");
    }

    return normalizeClaims(payload);
  }
}

function normalizeClaims(payload: JWTPayload): AppleIdTokenClaims {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new UnauthorizedException("Apple token missing `sub` claim");
  }
  const audience =
    typeof payload.aud === "string"
      ? payload.aud
      : Array.isArray(payload.aud) && typeof payload.aud[0] === "string"
        ? payload.aud[0]
        : "";

  const email =
    typeof payload.email === "string" && payload.email.length > 0
      ? payload.email.toLowerCase()
      : undefined;

  return {
    sub: payload.sub,
    email,
    emailVerified: coerceBool(payload.email_verified),
    isPrivateEmail: coerceBool(payload.is_private_email),
    audience,
  };
}

/**
 * Apple emits `email_verified` / `is_private_email` as either the
 * string `"true"`/`"false"` (older clients) or proper booleans (newer
 * native SDKs). Anything else is treated as unset.
 */
function coerceBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}
