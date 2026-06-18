/**
 * Zod schemas for the Sign-in-with-Apple auth method.
 *
 * One endpoint:
 *
 * - `POST /v1/auth/apple` — body `{ idToken, fullName? }`. The API
 *   verifies the JWT against Apple's JWKS, resolves or creates a `User`,
 *   and either returns a `TokenPair` or an email-verification challenge.
 *
 * `fullName` is the optional name payload Apple sends only on the very
 * first sign-in for a given `sub`. It is treated as a hint when creating
 * a brand-new user; subsequent sign-ins omit it.
 *
 * `appleFullNameSchema` is exported separately (not inlined) so it
 * registers as its own top-level OpenAPI component `AppleFullName`
 * rather than the glued `SignInWithAppleInputAppleFullName` form that
 * would otherwise result.
 *
 * The schema is `.strict()` so unknown keys produce 400 (matches every
 * other auth-method endpoint).
 */
import { z } from "zod";

export const appleFullNameSchema = z
  .object({
    givenName: z.string().max(80).nullish(),
    familyName: z.string().max(80).nullish(),
  })
  .strict()
  .meta({ id: "AppleFullName" });

export type AppleFullName = z.infer<typeof appleFullNameSchema>;

export const signInWithAppleInputSchema = z
  .object({
    idToken: z
      .string()
      .min(20)
      .describe(
        "Apple-issued identity token (JWT) from Sign in with Apple JS or the native SDK.",
      ),
    fullName: appleFullNameSchema
      .optional()
      .describe(
        "Optional name payload Apple sends only on the very first sign-in. Used as a hint when creating a new User.",
      ),
  })
  .strict()
  .meta({ id: "SignInWithAppleInput" });

export type SignInWithAppleInput = z.infer<typeof signInWithAppleInputSchema>;
