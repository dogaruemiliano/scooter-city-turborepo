/**
 * Response shapes for the core-auth controller.
 *
 * Each class mirrors the corresponding shared type in
 * `@repo/api-shared` (SessionUser, SessionSummary, TokenPair,
 * EnabledAuthMethods) and adds `@ApiProperty` decorators so Orval
 * picks the schemas up from the OpenAPI document.
 *
 * The shared types stay the contract surface; these classes exist only
 * because NestJS Swagger needs decorated classes to emit schemas.
 */
import { ApiProperty } from "@nestjs/swagger";

import type {
  EnabledAuthMethods,
  SessionSummary,
  SessionUser,
  TokenPair,
} from "@repo/api-shared";

export class SessionUserResponse implements SessionUser {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) emailVerified!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) phoneVerified!: string | null;
  @ApiProperty({ type: String, nullable: true }) firstName!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastName!: string | null;
  @ApiProperty() createdAt!: string;
}

export class SessionSummaryResponse implements SessionSummary {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) userAgent!: string | null;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() lastUsedAt!: string;
  @ApiProperty({
    description:
      "True for the session whose refresh token issued the current request.",
  })
  current!: boolean;
}

export class TokenPairResponse implements TokenPair {
  @ApiProperty({
    description:
      "Signed access JWT. Also set as the `access_token` HttpOnly cookie; mobile clients consume the body field.",
  })
  accessToken!: string;

  @ApiProperty({
    description:
      "Signed refresh JWT. Also set as the `refresh_token` HttpOnly cookie.",
  })
  refreshToken!: string;
}

export class EnabledAuthMethodsResponse implements EnabledAuthMethods {
  @ApiProperty() emailOtp!: boolean;
  @ApiProperty() smsOtp!: boolean;
  @ApiProperty() credentials!: boolean;
  @ApiProperty() google!: boolean;
  @ApiProperty() facebook!: boolean;
  @ApiProperty() apple!: boolean;
}

export class LogoutAllResponse {
  @ApiProperty({
    description:
      "Number of sessions revoked, excluding the caller's current session.",
  })
  sessionsRevoked!: number;
}
