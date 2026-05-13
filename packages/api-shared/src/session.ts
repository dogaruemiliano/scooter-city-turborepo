/**
 * Cross-consumer session shapes.
 *
 * These intentionally live outside `@repo/api-generated` so the web's
 * React context (and mobile's auth context) can reference a single,
 * stable type — independent of how the OpenAPI doc evolves. The API's
 * controllers return objects matching these shapes; the OpenAPI doc
 * mirrors the field set but consumers prefer this name for ergonomics.
 *
 * Dates are serialized as ISO strings — JSON has no native Date.
 */
export interface SessionUser {
  id: string;
  email: string;
  /** ISO timestamp of email verification, or `null` if unverified. */
  emailVerified: string | null;
  phone: string | null;
  /** ISO timestamp of phone verification, or `null` if unverified. */
  phoneVerified: string | null;
  firstName: string | null;
  lastName: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

/**
 * One row in the user-visible "active devices" list. The API joins
 * `Session` with the latest refresh-token activity to compute `current`.
 */
export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ip: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  lastUsedAt: string;
  /** `true` for the session whose refresh token is currently presenting the request. */
  current: boolean;
}

/**
 * Returned by `POST /v1/auth/*` endpoints in addition to setting cookies.
 * Mobile clients consume the body fields; the web ignores them because
 * cookies are authoritative.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Drives conditional rendering on every client (which login buttons /
 * forms to show). Returned by `GET /v1/auth/enabled-methods`. Mirrors the
 * API env flags one-for-one.
 */
export interface EnabledAuthMethods {
  emailOtp: boolean;
  smsOtp: boolean;
  credentials: boolean;
  google: boolean;
  facebook: boolean;
  apple: boolean;
}
