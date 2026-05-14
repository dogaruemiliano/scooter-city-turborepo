/**
 * Zod schemas for the Google Sign-in auth method.
 *
 * One endpoint:
 *
 * - `POST /v1/auth/google` — body `{ idToken }`. The client (Google
 *   Identity Services on web, native Google SDK on mobile) obtains the
 *   ID token directly from Google; the API verifies its signature and
 *   audience, links/creates the user, and issues an API session.
 *
 * The schema is `.strict()` so any extra key (e.g. an accidental
 * `code` or `redirectUri` from a copy-paste of the OAuth-code flow)
 * surfaces as a 400 instead of being silently ignored.
 */
import { z } from "zod";

export const googleSigninSchema = z
  .object({
    idToken: z
      .string()
      .min(20)
      .describe(
        "Google-issued ID token (JWT) from Google Identity Services or the native SDK.",
      ),
  })
  .strict()
  .meta({ id: "GoogleSignin" });

export type GoogleSigninInput = z.infer<typeof googleSigninSchema>;
