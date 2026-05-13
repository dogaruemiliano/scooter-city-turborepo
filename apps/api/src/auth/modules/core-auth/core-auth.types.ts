/**
 * Public types of `CoreAuthService`. Kept in a sibling file so consumers
 * (auth-method modules in PR 5+, controller DTOs, tests) can `import
 * type` without dragging in the runtime service module.
 */
import type { User } from "../../../generated/prisma/client";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Lifetime of the access token in seconds. */
  accessTokenExpiresInSec: number;
  /** Lifetime of the refresh token in seconds. */
  refreshTokenExpiresInSec: number;
}

export interface IssueSessionInput {
  /** Only `id` + `email` are read; pass the full row if convenient. */
  user: Pick<User, "id" | "email">;
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssueSessionResult extends TokenPair {
  sessionId: string;
}
