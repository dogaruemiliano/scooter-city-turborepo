/**
 * Request body for `POST /v1/auth/refresh`.
 *
 * Both the cookie path (web) and the JSON-body path (mobile) reach this
 * endpoint. The cookie wins if both are present so a stale-body request
 * can't override a fresh-cookie session.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class RefreshTokensDto {
  @ApiPropertyOptional({
    description:
      "Refresh token (mobile clients without a cookie jar pass it in the body). Ignored when an `access_token` cookie is present and valid.",
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
