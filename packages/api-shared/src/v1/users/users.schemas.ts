/**
 * Users-domain Zod schemas.
 *
 * `userResponseSchema` is the **maximal** public-user wire-shape — the
 * union of every field that a user record could legitimately return on
 * any future `/v1/users/*` endpoint. It is the single source of truth
 * for every user-shaped response on the API.
 *
 * Different endpoints expose different projections of this shape based
 * on permissions and visibility. Each projection is a `.pick(...)` over
 * this schema, never a redeclaration:
 *
 * - `GET  /v1/auth/me` — owner view of self. Picks every field except
 *   `updatedAt` and re-`.meta()`s it as `SessionUserResponse` (see
 *   `auth/auth.schemas.ts`).
 * - `GET  /v1/users/:id` (future) — admin / owner view of one user.
 *   Returns the full shape.
 * - `GET  /v1/users` (future, permission-gated) — a public listing
 *   visible to lower-privileged callers would `.pick({ id, firstName,
 *   lastName })` to redact contact and verification fields. An admin
 *   listing on the same endpoint could return more.
 * - Embeds in other resources (e.g. `Comment.author`) compose the same
 *   way — `.pick(...)` for whatever subset that resource exposes.
 *
 * **Field visibility is enforced at the controller**: the controller
 * chooses which projection schema to return, and the global
 * `ZodSerializerInterceptor` strips anything outside that projection.
 * The maximal schema below describes *what could be returned*, not
 * *what is always returned*. Never use this schema as a serializer for
 * an unauthenticated or lower-privileged response; pick a subset.
 *
 * Date-valued fields are ISO 8601 strings — JSON has no native `Date`.
 * Nullable fields use `.nullable()` rather than `.optional()` because
 * the API always sends the key when the field is in the projection;
 * clients depend on stable shapes.
 *
 * No format constraints (e.g. `z.email()`, phone regex) on outgoing
 * fields. The serializer parses every response through these schemas
 * (or their picks); tightening a format here would 500 any row whose
 * stored value pre-dates the constraint. Inbound validation tightens
 * format; outbound serialization stays structural.
 *
 * No `/v1/users/*` controller exists yet — this schema lives here because
 * `SessionUser` is a pick of it and we want both shapes to share one
 * definition from day one.
 */
import { z } from "zod";

export const userResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    emailVerified: z
      .string()
      .nullable()
      .describe(
        "ISO timestamp of email verification, or `null` if unverified.",
      ),
    phone: z.string().nullable(),
    phoneVerified: z
      .string()
      .nullable()
      .describe(
        "ISO timestamp of phone verification, or `null` if unverified.",
      ),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    createdAt: z.string().describe("ISO timestamp of account creation."),
    updatedAt: z.string().describe("ISO timestamp of last profile update."),
  })
  .meta({ id: "UserResponse" });

export type User = z.infer<typeof userResponseSchema>;
