/**
 * Public `CoreAuthService` types. Kept separate so consumers can use
 * type-only imports without loading the service module.
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
  /** Only `id` + `email` + `roles` are read; pass the full row if convenient. */
  user: Pick<User, "id" | "email" | "roles">;
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssueSessionResult extends TokenPair {
  sessionId: string;
}
