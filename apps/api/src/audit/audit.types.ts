/**
 * Closed vocabulary for `AuditEvent.type`. Stored as a plain `String`
 * column in Postgres (no migration needed when adding new values), but
 * services MUST emit one of these constants — never a raw string.
 *
 * The corresponding human-readable description for each type lives in
 * [docs/auth/sessions-and-audit.md](../../../../docs/auth/sessions-and-audit.md).
 */
export const AuditEventType = {
  SIGNUP: "SIGNUP",
  SIGNUP_ATTEMPT_EXISTING_EMAIL: "SIGNUP_ATTEMPT_EXISTING_EMAIL",
  EMAIL_VERIFY_SENT: "EMAIL_VERIFY_SENT",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAIL: "LOGIN_FAIL",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_CONFIRMED: "PASSWORD_RESET_CONFIRMED",
  OAUTH_LINKED: "OAUTH_LINKED",
  OAUTH_UNLINKED: "OAUTH_UNLINKED",
  SESSION_REVOKED: "SESSION_REVOKED",
  SESSION_BURNED: "SESSION_BURNED",
  LOGOUT_ALL: "LOGOUT_ALL",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  NEW_DEVICE_NOTIFIED: "NEW_DEVICE_NOTIFIED",
} as const;

export type AuditEventType =
  (typeof AuditEventType)[keyof typeof AuditEventType];
