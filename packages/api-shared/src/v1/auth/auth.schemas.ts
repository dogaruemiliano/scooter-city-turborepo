/**
 * Auth-domain Zod schemas — request bodies, response bodies, and reusable
 * field validators for every `/v1/auth/*` endpoint.
 *
 * Consumed by the NestJS API via `nestjs-zod`'s `createZodDto`, and by
 * web/mobile form validators via `@hookform/resolvers/zod`. The same
 * schema validates on every side of the wire — drift between server and
 * client validation is impossible by construction.
 *
 * Naming convention (see `docs/migration-plans/zod-input-output-split.md`):
 *   - Inputs:  `*InputSchema` here, `.meta({ id: "*Input" })`, `class *Input` in NestJS.
 *   - Outputs: `*Schema` here,      `.meta({ id: "*" })`,      `class *` in NestJS.
 *   - No `Dto` suffix anywhere. `@ZodResponse` is the response decorator.
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

import { userSchema } from "../users/users.schemas";
import { AUTH_METHOD_IDS, OAUTH_PROVIDERS } from "./auth.constants";

const profileNameSchema = z.string().trim().min(1).max(100).nullable();

/**
 * Editable fields accepted by `PATCH /v1/auth/me`.
 *
 * Empty form fields are sent as `null`; blank strings are rejected so every
 * client stores the same canonical representation.
 */
export const updateProfileInputSchema = z
  .object({
    firstName: profileNameSchema.optional(),
    lastName: profileNameSchema.optional(),
  })
  .strict()
  .meta({ id: "UpdateProfileInput" });

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

/**
 * Request body for `POST /v1/auth/refresh`.
 *
 * Both the cookie path (web) and the JSON-body path (mobile) reach this
 * endpoint. When a `refresh_token` cookie is present the cookie
 * wins — `refreshToken` in the body is ignored.
 */
export const refreshTokenInputSchema = z
  .object({
    refreshToken: z
      .string()
      .optional()
      .describe(
        "Refresh token (mobile clients without a cookie jar pass it in the body). Ignored when an `access_token` cookie is present and valid.",
      ),
  })
  .strict()
  .meta({ id: "RefreshTokenInput" });

export type RefreshTokenInput = z.infer<typeof refreshTokenInputSchema>;

// ────────────────────────────────────────────────────────────────────────
// Response schemas
// ────────────────────────────────────────────────────────────────────────

/**
 * `GET /v1/auth/me` response — the owner's view of their own user
 * record. Picks every public field except `updatedAt` from
 * `users.userSchema` (the maximal user wire-shape), then adds the OAuth
 * providers needed by account-management clients.
 */
export const sessionUserSchema = userSchema
  .pick({
    id: true,
    email: true,
    emailVerified: true,
    phone: true,
    phoneVerified: true,
    firstName: true,
    lastName: true,
    roles: true,
    createdAt: true,
  })
  .extend({
    linkedProviders: z.array(z.enum(OAUTH_PROVIDERS)),
  })
  .meta({ id: "SessionUser" });

export type SessionUser = z.infer<typeof sessionUserSchema>;

/**
 * One row in the user-visible "active devices" list returned by
 * `GET /v1/auth/sessions`. The API joins `Session` with the latest
 * refresh-token activity to compute `current`.
 */
export const sessionSummarySchema = z
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
  .meta({ id: "SessionSummary" });

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/**
 * Returned by every endpoint that mints a fresh session (`/refresh`,
 * `/email-otp/verify`, `/google`, `/apple`) in
 * addition to setting cookies. Mobile clients read the body fields; the
 * web ignores them because cookies are authoritative.
 */
export const tokenPairSchema = z
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
  .meta({ id: "TokenPair" });

export type TokenPair = z.infer<typeof tokenPairSchema>;

/**
 * Server-enabled authentication capabilities returned by
 * `GET /v1/auth/enabled-methods`. Clients still decide which methods
 * they implement and have configured locally.
 */
export const authMethodIdSchema = z.enum(AUTH_METHOD_IDS);
export type AuthMethodId = z.infer<typeof authMethodIdSchema>;

export const enabledAuthMethodsSchema = z
  .object({
    methods: z.array(authMethodIdSchema),
  })
  .meta({ id: "EnabledAuthMethods" });

export type EnabledAuthMethods = z.infer<typeof enabledAuthMethodsSchema>;

/**
 * Returned by `POST /v1/auth/logout-all` — count of sessions revoked.
 */
export const logoutAllResultSchema = z
  .object({
    sessionsRevoked: z
      .number()
      .int()
      .describe(
        "Number of sessions revoked, including the caller's current session.",
      ),
  })
  .meta({ id: "LogoutAllResult" });

export type LogoutAllResult = z.infer<typeof logoutAllResultSchema>;
