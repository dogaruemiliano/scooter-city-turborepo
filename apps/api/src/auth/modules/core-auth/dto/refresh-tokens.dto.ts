/**
 * Request body for `POST /v1/auth/refresh`.
 *
 * Both the cookie path (web) and the JSON-body path (mobile) reach this
 * endpoint. The cookie wins if both are present so a stale-body request
 * can't override a fresh-cookie session.
 *
 * The validation rules (and the description that ends up in the OpenAPI
 * doc) live in `v1.auth.refreshTokensSchema` — see
 * `packages/api-shared/src/v1/auth/auth.schemas.ts`. This class is just
 * the NestJS-compatible wrapper that lets us write `@Body() dto: RefreshTokensDto`.
 */
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class RefreshTokensDto extends createZodDto(
  v1.auth.refreshTokensSchema,
) {}
