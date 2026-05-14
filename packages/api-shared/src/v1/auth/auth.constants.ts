/**
 * Auth-domain shared constants — cookie names and fully-qualified route paths.
 *
 * # Cookies
 *
 * The API sets these (HttpOnly, Secure-in-prod, SameSite=Lax). The web
 * `proxy.ts` middleware reads them to decide when to lazy-refresh. Mobile
 * clients use Bearer tokens instead — these constants are harmless on
 * mobile but only the web depends on them.
 *
 * Names are *contract*. Renaming requires a coordinated change across
 * apps/api, apps/web/proxy.ts, and any persisted browser cookie jars
 * (existing sessions would be evicted).
 *
 * # Routes
 *
 * Orval gives consumers typed *operation functions* (e.g.
 * `coreAuthRefresh()`); it does NOT give them human-readable path
 * strings. The web `proxy.ts` middleware needs the raw paths to decide
 * which requests to intercept for lazy refresh — that's the primary
 * reason `ROUTES` exists. Tests and ad-hoc `fetch` calls also use it as a
 * single source of truth.
 *
 * Adding or renaming an endpoint REQUIRES updating both the controller
 * decorator and the corresponding entry here. The two are intentionally
 * coupled — the OpenAPI doc is generated from controllers, not from this
 * constant.
 */

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

export type AuthCookieName =
  | typeof ACCESS_TOKEN_COOKIE
  | typeof REFRESH_TOKEN_COOKIE;

export const ROUTES = {
  // Session lifecycle (core-auth controller, always-on)
  refresh: "/v1/auth/refresh",
  logout: "/v1/auth/logout",
  logoutAll: "/v1/auth/logout-all",
  me: "/v1/auth/me",
  /** Account deletion: `DELETE /v1/auth/me`. Shares path with `me`. */
  deleteMe: "/v1/auth/me",
  enabledMethods: "/v1/auth/enabled-methods",

  // Email OTP
  emailOtp: {
    request: "/v1/auth/email-otp/request",
    verify: "/v1/auth/email-otp/verify",
  },

  // SMS OTP
  smsOtp: {
    request: "/v1/auth/sms-otp/request",
    verify: "/v1/auth/sms-otp/verify",
  },

  // OAuth (client posts a provider-issued ID token)
  google: "/v1/auth/google",
  apple: "/v1/auth/apple",

  // Sessions (logged-in user managing their own active devices)
  sessions: {
    list: "/v1/auth/sessions",
    /** `DELETE /v1/auth/sessions/:id` — revoke one specific session. */
    revoke: (id: string): string => `/v1/auth/sessions/${id}`,
  },

  // OAuth account linking management
  accounts: {
    /** `DELETE /v1/auth/accounts/:provider` — refuses if it would leave the user without any auth method. */
    unlink: (provider: "google" | "apple"): string =>
      `/v1/auth/accounts/${provider}`,
  },
} as const;
