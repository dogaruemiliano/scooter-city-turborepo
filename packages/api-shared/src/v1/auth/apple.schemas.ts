/**
 * Zod schemas for the Sign-in-with-Apple auth method.
 *
 * One endpoint:
 *
 * - `POST /v1/auth/apple` — body `{ idToken, fullName? }`. The API
 *   verifies the JWT against Apple's JWKS, resolves or creates a `User`,
 *   issues a session, sets cookies, and returns a `TokenPair`.
 *
 * `fullName` is the optional name payload Apple sends only on the very
 * first sign-in for a given `sub`. It is treated as a hint when creating
 * a brand-new user; subsequent sign-ins omit it.
 *
 * The schema is `.strict()` so unknown keys produce 400 (matches every
 * other auth-method endpoint).
 */
import { z } from "zod";

const fullNameSchema = z
  .object({
    givenName: z.string().max(80).nullish(),
    familyName: z.string().max(80).nullish(),
  })
  .strict()
  .meta({ id: "AppleFullName" });

export const appleSigninSchema = z
  .object({
    idToken: z
      .string()
      .min(20)
      .describe(
        "Apple-issued identity token (JWT) from Sign in with Apple JS or the native SDK.",
      ),
    fullName: fullNameSchema
      .optional()
      .describe(
        "Optional name payload Apple sends only on the very first sign-in. Used as a hint when creating a new User.",
      ),
  })
  .strict()
  .meta({ id: "AppleSignin" });

export type AppleSigninInput = z.infer<typeof appleSigninSchema>;
export type AppleFullName = z.infer<typeof fullNameSchema>;
