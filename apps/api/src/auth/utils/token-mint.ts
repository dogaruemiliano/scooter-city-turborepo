/**
 * Pure helpers for JWT minting + lifetime conversion.
 *
 * Lives separately from [CoreAuthService](../modules/core-auth/core-auth.service.ts)
 * so:
 *   - The service can focus on orchestration (DB writes, transactions,
 *     revocation rules) instead of crypto details.
 *   - These helpers get cheap unit tests with no Postgres or NestJS
 *     test-module ceremony.
 *   - Future changes to minting (e.g. swap in `kid`-based key rotation)
 *     happen in one well-tested file.
 *
 * Nothing here depends on Prisma, Nest, or any other framework. Inputs
 * come in, signed strings go out.
 */
import { randomUUID } from "node:crypto";

import type { JwtService } from "@nestjs/jwt";
import ms from "ms";

import type { JwtPayload } from "../auth.types";

/** Re-exported under a clearer name for call-site readability. */
export type AccessTokenClaims = Omit<JwtPayload, "tokenType">;

export interface RefreshTokenClaims {
  /** Prevents a refresh JWT from being accepted as an access JWT. */
  tokenType: "refresh";
  /** User ID. */
  sub: string;
  /** Session ID. */
  sid: string;
  /** Unique JWT ID. Lookup key for the matching `RefreshToken` row. */
  jti: string;
}

export interface MintedToken {
  /** Signed JWT. */
  token: string;
  /** Issued-at unix timestamp (seconds). */
  iatSec: number;
  /** Expiry unix timestamp (seconds). */
  expSec: number;
}

const MS_PER_SEC = 1000;

/**
 * Convert a `ms`-format duration string (`"15m"`, `"90d"`, …) into
 * whole seconds. The env schema validates the input format upstream, so
 * a parse failure here means a misconfiguration we want to surface
 * loudly at startup rather than at first-request.
 */
export function ttlStringToSeconds(ttl: string): number {
  // `ms` throws on some malformed inputs (empty string, etc.) and
  // returns `undefined` on others. Treat both as invalid input.
  let parsedMs: number | undefined;
  try {
    parsedMs = ms(ttl as ms.StringValue);
  } catch {
    parsedMs = undefined;
  }
  if (typeof parsedMs !== "number" || !Number.isFinite(parsedMs)) {
    throw new Error(
      `Invalid JWT TTL value "${ttl}" — expected ms-format string like "15m" or "90d"`,
    );
  }
  return Math.floor(parsedMs / MS_PER_SEC);
}

/**
 * Sign the access JWT and report its `iat`/`exp` claims so the caller
 * can compute `accessTokenExpiresInSec` for response bodies without
 * re-decoding.
 *
 * The RS256 private key and algorithm come from `JwtModule.registerAsync`
 * in [auth.module.ts](../auth.module.ts) — the public key is exposed via
 * JWKS so first-party verifiers (Next.js RSCs, future microservices) can
 * verify locally without the private key ever leaving this process.
 */
export function mintAccessToken(
  jwt: JwtService,
  claims: AccessTokenClaims,
  ttl: string,
): MintedToken {
  const expiresInSec = ttlStringToSeconds(ttl);
  const token = jwt.sign(
    { ...claims, tokenType: "access" },
    {
      expiresIn: expiresInSec,
    },
  );
  const decoded = jwt.decode<{ exp?: number; iat?: number }>(token);
  return readMintedToken(token, decoded, expiresInSec);
}

/**
 * Sign the refresh JWT, generating a fresh `jti`. Returns the new `jti`
 * separately so the caller can index the matching `RefreshToken` row by
 * it without re-decoding the JWT.
 *
 * Uses the same keypair as access tokens (refresh JWTs are server-internal
 * — only this API verifies them — so splitting the keypair would double
 * operational overhead without raising the security ceiling).
 */
export function mintRefreshToken(
  jwt: JwtService,
  partial: Omit<RefreshTokenClaims, "jti" | "tokenType">,
  ttl: string,
): MintedToken & { jti: string } {
  const jti = randomUUID();
  const claims: RefreshTokenClaims = {
    ...partial,
    jti,
    tokenType: "refresh",
  };
  const expiresInSec = ttlStringToSeconds(ttl);
  const token = jwt.sign(claims, { expiresIn: expiresInSec });
  const decoded = jwt.decode<{ exp?: number; iat?: number }>(token);
  return { ...readMintedToken(token, decoded, expiresInSec), jti };
}

function readMintedToken(
  token: string,
  decoded: { exp?: number; iat?: number },
  fallbackTtlSec: number,
): MintedToken {
  const nowSec = Math.floor(Date.now() / MS_PER_SEC);
  return {
    token,
    iatSec: decoded.iat ?? nowSec,
    expSec: decoded.exp ?? nowSec + fallbackTtlSec,
  };
}
