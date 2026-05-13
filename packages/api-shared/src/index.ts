/**
 * Public barrel for `@repo/api-shared`.
 *
 * Sections mirror the README's table. See ./README.md for what belongs
 * here vs in `@repo/api-generated`.
 */

// ── Cookies ───────────────────────────────────────────────────────────
export {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  type AuthCookieName,
} from "./cookies";

// ── Session shapes ────────────────────────────────────────────────────
export type {
  SessionUser,
  SessionSummary,
  TokenPair,
  EnabledAuthMethods,
} from "./session";

// ── Zod fragments ─────────────────────────────────────────────────────
export {
  emailSchema,
  phoneSchema,
  otpCodeSchema,
  passwordSchema,
} from "./schemas";

// ── Route paths ───────────────────────────────────────────────────────
export { ROUTES } from "./routes";
