/**
 * Cookie helpers used by every controller that issues or clears auth
 * cookies. Centralized here so the flag set can't drift between
 * controllers (the m-turborepo reference repo had a bug where the
 * refresh-token cookie's `path` differed from the access-token cookie's;
 * sharing a builder eliminates that whole class of mistakes).
 *
 * Flags applied:
 *
 * - `httpOnly: true` — JavaScript can't read the cookie. Defends against
 *   XSS-driven token theft.
 * - `secure` — true in production, false in dev (so `http://localhost`
 *   works). The runtime check uses `NODE_ENV === "production"`.
 * - `sameSite: "lax"` — see [docs/auth/cookies.md](../../../../docs/auth/cookies.md).
 *   Lax requires web + API to share an eTLD+1 in prod (set via
 *   `COOKIE_DOMAIN`).
 * - `path: "/"` — both cookies travel on every request to the API
 *   origin, including `/auth/refresh`.
 * - `maxAge` — matched to the JWT `exp` so the browser drops the cookie
 *   exactly when the JWT becomes invalid.
 */
import { v1 } from "@repo/api-shared";
import type { CookieOptions, Response } from "express";

import type { Env } from "../../config/env";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Lifetime of the access token in seconds. */
  accessTokenExpiresInSec: number;
  /** Lifetime of the refresh token in seconds. */
  refreshTokenExpiresInSec: number;
}

/** Base options shared by both cookies. Per-cookie overrides set `maxAge`. */
export function cookieBaseOptions(env: Env): CookieOptions {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  env: Env,
  tokens: TokenPair,
): void {
  const base = cookieBaseOptions(env);
  res.cookie(v1.auth.ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: tokens.accessTokenExpiresInSec * 1000,
  });
  res.cookie(v1.auth.REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: tokens.refreshTokenExpiresInSec * 1000,
  });
}

export function clearAuthCookies(res: Response, env: Env): void {
  // `clearCookie` only matches when the same path + domain attributes
  // were used at set time. Mirror them precisely.
  const base = cookieBaseOptions(env);
  res.clearCookie(v1.auth.ACCESS_TOKEN_COOKIE, base);
  res.clearCookie(v1.auth.REFRESH_TOKEN_COOKIE, base);
}
