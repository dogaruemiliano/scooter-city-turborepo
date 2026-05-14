/**
 * Auth-domain Zod schemas — request bodies, query params, and reusable
 * field validators for every `/v1/auth/*` endpoint.
 *
 * Consumed by the NestJS API via `nestjs-zod`'s `createZodDto`, and by
 * web/mobile form validators (later) via `@hookform/resolvers/zod`. The
 * same schema validates on every side of the wire — drift between server
 * and client validation is impossible by construction.
 *
 * Schemas use `.strict()` where unknown keys should produce a 400, which
 * mirrors NestJS's `forbidNonWhitelisted: true` behavior on the legacy
 * class-validator pipe.
 */
import { z } from "zod";

/**
 * Request body for `POST /v1/auth/refresh`.
 *
 * Both the cookie path (web) and the JSON-body path (mobile) reach this
 * endpoint. When an `access_token` cookie is present and valid the cookie
 * wins — `refreshToken` in the body is ignored.
 */
export const refreshTokensSchema = z
  .object({
    refreshToken: z
      .string()
      .optional()
      .describe(
        "Refresh token (mobile clients without a cookie jar pass it in the body). Ignored when an `access_token` cookie is present and valid.",
      ),
  })
  .strict();

export type RefreshTokensInput = z.infer<typeof refreshTokensSchema>;
