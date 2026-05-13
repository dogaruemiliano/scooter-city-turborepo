/**
 * Internal auth-context shapes.
 *
 * `AuthPrincipal` is what `JwtStrategy.validate` returns and what every
 * `@CurrentUser()` decorator yields downstream. It is intentionally
 * narrower than `SessionUser` (from `@repo/api-shared`) — the principal
 * carries just enough identity for downstream guards/services to act,
 * while the response-shape `SessionUser` includes profile fields.
 */
export interface JwtPayload {
  /** User ID. */
  sub: string;
  /** Email at time of token issue. Convenience for logging — re-read DB for fresh values. */
  email: string;
  /** Session ID this token belongs to. */
  sid: string;
}

export interface AuthPrincipal {
  id: string;
  email: string;
  sessionId: string;
}

/** `passport-jwt` puts the return of `JwtStrategy.validate` on `req.user`. */
export interface RequestWithUser {
  user: AuthPrincipal;
}
