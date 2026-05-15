/**
 * Auth-domain Zod schemas — request bodies, response bodies, and reusable
 * field validators for every `/v1/auth/*` endpoint.
 *
 * Consumed by the NestJS API via `nestjs-zod`'s `createZodDto`, and by
 * web/mobile form validators (later) via `@hookform/resolvers/zod`. The
 * same schema validates on every side of the wire — drift between server
 * and client validation is impossible by construction.
 *
 * Request schemas use `.strict()` so unknown keys produce 400, mirroring
 * `forbidNonWhitelisted: true` on the legacy class-validator pipe.
 * Response schemas omit `.strict()` because the global
 * `ZodSerializerInterceptor` strips unknown fields before serialization —
 * an extra DB column accidentally returned by a service does not leak.
 *
 * Response shapes intentionally avoid format constraints (e.g. `z.email()`,
 * regex patterns) on outgoing fields. The serializer parses every response
 * through these schemas, and a tightened format here would 500 any row
 * whose stored value pre-dates the constraint. Inbound validation tightens
 * format; outbound serialization stays structural.
 */
import { z } from "zod";

import { userResponseSchema } from "../users/users.schemas";

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

// ────────────────────────────────────────────────────────────────────────
// Response schemas
//
// Each schema gets a stable `.meta({ id })` matching the eventual DTO
// class name so the OpenAPI doc and the Orval-generated client share the
// same identifier. Names ending in `Response` mirror the request-side
// convention (`...Dto`).
// ────────────────────────────────────────────────────────────────────────

/**
 * `GET /v1/auth/me` response — the owner's view of their own user
 * record. Picks every public field except `updatedAt` from
 * `users.userResponseSchema` (the maximal user wire-shape). When a
 * `/v1/users/:id` endpoint ships, it returns the full `UserResponse`
 * and this projection diverges only by the omitted `updatedAt`.
 */
export const sessionUserResponseSchema = userResponseSchema
  .pick({
    id: true,
    email: true,
    emailVerified: true,
    phone: true,
    phoneVerified: true,
    firstName: true,
    lastName: true,
    createdAt: true,
  })
  .meta({ id: "SessionUserResponse" });

export type SessionUser = z.infer<typeof sessionUserResponseSchema>;

/**
 * One row in the user-visible "active devices" list returned by
 * `GET /v1/auth/sessions`. The API joins `Session` with the latest
 * refresh-token activity to compute `current`.
 */
export const sessionSummaryResponseSchema = z
  .object({
    id: z.string(),
    userAgent: z.string().nullable(),
    ip: z.string().nullable(),
    createdAt: z.string().describe("ISO timestamp."),
    lastUsedAt: z.string().describe("ISO timestamp."),
    current: z
      .boolean()
      .describe(
        "True for the session whose refresh token issued the current request.",
      ),
  })
  .meta({ id: "SessionSummaryResponse" });

export type SessionSummary = z.infer<typeof sessionSummaryResponseSchema>;

/**
 * Returned by every endpoint that mints a fresh session (`/refresh`,
 * `/email-otp/verify`, `/sms-otp/verify`, `/google`, `/apple`) in
 * addition to setting cookies. Mobile clients read the body fields; the
 * web ignores them because cookies are authoritative.
 */
export const tokenPairResponseSchema = z
  .object({
    accessToken: z
      .string()
      .describe(
        "Signed access JWT. Also set as the `access_token` HttpOnly cookie; mobile clients consume the body field.",
      ),
    refreshToken: z
      .string()
      .describe(
        "Signed refresh JWT. Also set as the `refresh_token` HttpOnly cookie.",
      ),
  })
  .meta({ id: "TokenPairResponse" });

export type TokenPair = z.infer<typeof tokenPairResponseSchema>;

/**
 * Drives conditional rendering on every client (which login buttons /
 * forms to show). Returned by `GET /v1/auth/enabled-methods`. Mirrors
 * the API env flags one-for-one.
 */
export const enabledAuthMethodsResponseSchema = z
  .object({
    emailOtp: z.boolean(),
    smsOtp: z.boolean(),
    google: z.boolean(),
    apple: z.boolean(),
  })
  .meta({ id: "EnabledAuthMethodsResponse" });

export type EnabledAuthMethods = z.infer<
  typeof enabledAuthMethodsResponseSchema
>;

/**
 * Returned by `POST /v1/auth/logout-all` — count of sessions revoked.
 */
export const logoutAllResponseSchema = z
  .object({
    sessionsRevoked: z
      .number()
      .int()
      .describe(
        "Number of sessions revoked, excluding the caller's current session.",
      ),
  })
  .meta({ id: "LogoutAllResponse" });

export type LogoutAllResult = z.infer<typeof logoutAllResponseSchema>;
