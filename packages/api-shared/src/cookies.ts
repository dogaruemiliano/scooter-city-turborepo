/**
 * Cookie names used by the auth subsystem.
 *
 * The API sets these (HttpOnly, Secure-in-prod, SameSite=Lax). The web
 * `proxy.ts` middleware reads them to decide when to lazy-refresh. Mobile
 * clients use Bearer tokens instead — these constants are harmless on
 * mobile but only the web depends on them.
 *
 * Names are *contract*. Renaming requires a coordinated change across
 * apps/api, apps/web/proxy.ts, and any persisted browser cookie jars
 * (existing sessions would be evicted).
 */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

export type AuthCookieName =
  | typeof ACCESS_TOKEN_COOKIE
  | typeof REFRESH_TOKEN_COOKIE;
