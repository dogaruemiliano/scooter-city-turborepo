/**
 * Fully-qualified path constants for every auth endpoint.
 *
 * Orval gives consumers typed *operation functions* (e.g.
 * `coreAuthRefresh()`); it does NOT give them human-readable path
 * strings. The web `proxy.ts` middleware needs the raw paths to decide
 * which requests to intercept for lazy refresh — that's the primary
 * reason this constant exists. Tests and ad-hoc `fetch` calls also use
 * it as a single source of truth.
 *
 * Adding or renaming an endpoint REQUIRES updating both the controller
 * decorator and the corresponding entry here. The two are intentionally
 * coupled — the OpenAPI doc is generated from controllers, not from this
 * constant.
 */
export const ROUTES = {
  // Session lifecycle (core-auth controller, always-on)
  refresh: "/v1/auth/refresh",
  logout: "/v1/auth/logout",
  logoutAll: "/v1/auth/logout-all",
  me: "/v1/auth/me",
  /** Account deletion: `DELETE /v1/auth/me`. Shares path with `me`. */
  deleteMe: "/v1/auth/me",
  enabledMethods: "/v1/auth/enabled-methods",

  // Credentials (email + password)
  credentials: {
    signup: "/v1/auth/credentials/signup",
    login: "/v1/auth/credentials/login",
    verifyEmail: "/v1/auth/credentials/verify-email",
    resetRequest: "/v1/auth/credentials/reset/request",
    resetConfirm: "/v1/auth/credentials/reset/confirm",
  },

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
  facebook: "/v1/auth/facebook",
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
    unlink: (provider: "google" | "facebook" | "apple"): string =>
      `/v1/auth/accounts/${provider}`,
  },
} as const;
