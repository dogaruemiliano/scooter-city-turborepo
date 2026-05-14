/**
 * JWT extractors for passport-jwt.
 *
 * The strategy uses a *chain* of extractors (`ExtractJwt.fromExtractors`):
 *
 *   1. **Cookie first** (`access_token`). The web app's HttpOnly cookie
 *      is the primary transport — readers never see the token.
 *   2. **Authorization: Bearer fallback.** Required for non-browser
 *      clients (mobile, server-to-server) that don't share cookie jars.
 *
 * Order matters: a browser that has both a cookie and an Authorization
 * header should be trusted by the cookie (which it can't forge from
 * JavaScript), not the header (which a malicious script could attach).
 *
 * The cookie name comes from `@repo/api-shared` so the web client and
 * mobile client can never disagree with the API about what to call it.
 */
import { v1 } from "@repo/api-shared";
import type { Request } from "express";
import type { JwtFromRequestFunction } from "passport-jwt";
import { ExtractJwt } from "passport-jwt";

/** Reads `req.cookies[v1.auth.ACCESS_TOKEN_COOKIE]`, or returns `null`. */
export const cookieAccessTokenExtractor: JwtFromRequestFunction<Request> = (
  req: Request,
) => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[v1.auth.ACCESS_TOKEN_COOKIE] ?? null;
};

/**
 * Cookie-first chain used by the global `JwtStrategy`.
 *
 * Explicit return type annotation: without it, TS infers the type as
 * `JwtFromRequestFunction<Request>` whose `Request` references
 * `@types/express-serve-static-core` / `@types/qs` via pnpm-hoisted
 * symlinks. `tsc --declaration` (Nest's build) refuses to emit a
 * declaration that names types outside the package's own dep graph.
 */
export const accessTokenExtractor: JwtFromRequestFunction =
  ExtractJwt.fromExtractors([
    cookieAccessTokenExtractor,
    ExtractJwt.fromAuthHeaderAsBearerToken(),
  ]);
