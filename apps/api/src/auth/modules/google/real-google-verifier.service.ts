/**
 * Production implementation of {@link GoogleVerifier}.
 *
 * Uses `google-auth-library`'s `OAuth2Client.verifyIdToken` which:
 *   - Fetches and caches Google's federated signing certificates.
 *   - Verifies the JWT signature against those certs.
 *   - Checks `exp` (with the library's small clock-skew tolerance).
 *   - Confirms `aud` is one of the configured audiences.
 *   - Confirms `iss` is `accounts.google.com` or `https://accounts.google.com`.
 *
 * The audience list is the union of `GOOGLE_CLIENT_ID_WEB|IOS|ANDROID`
 * — whichever the env supplies. The cross-field rule in `env.ts`
 * requires at least one to be present whenever `AUTH_GOOGLE_ENABLED=true`,
 * so the filtered array is non-empty whenever this service is
 * instantiated by `AuthModule.forRoot()`. If the constructor still sees
 * an empty list (e.g. someone bypassed the env validator), it throws
 * at construction time rather than per-request — fail fast.
 *
 * Any failure (signature mismatch, expired, wrong audience, network
 * error fetching certs) collapses to a single
 * `UnauthorizedException("Invalid Google ID token")`. Never include
 * `error.message` in the response — it can leak why verification failed
 * and turn the endpoint into an oracle.
 */
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client, type TokenPayload } from "google-auth-library";

import { ENV } from "../../../config/config.module";
import type { Env } from "../../../config/env";

import {
  GoogleIdTokenClaims,
  GoogleVerifier,
} from "./google-verifier.interface";

@Injectable()
export class RealGoogleVerifier extends GoogleVerifier {
  private readonly client: OAuth2Client;
  private readonly audiences: string[];

  constructor(@Inject(ENV) env: Env) {
    super();
    this.audiences = [
      env.GOOGLE_CLIENT_ID_WEB,
      env.GOOGLE_CLIENT_ID_IOS,
      env.GOOGLE_CLIENT_ID_ANDROID,
    ].filter((id): id is string => Boolean(id));

    if (this.audiences.length === 0) {
      throw new Error(
        "RealGoogleVerifier requires at least one of GOOGLE_CLIENT_ID_WEB|IOS|ANDROID. " +
          "The env validator should have caught this — check apps/api/src/config/env.ts.",
      );
    }

    this.client = new OAuth2Client();
  }

  async verify(idToken: string): Promise<GoogleIdTokenClaims> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audiences,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException("Invalid Google ID token");
    }

    if (!payload || !payload.sub || !payload.email) {
      throw new UnauthorizedException("Invalid Google ID token");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name,
      picture: payload.picture,
    };
  }
}
