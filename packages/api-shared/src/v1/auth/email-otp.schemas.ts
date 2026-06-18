/**
 * Zod schemas for the email-OTP auth method.
 *
 * Two endpoints:
 *
 * - `POST /v1/auth/email-otp/request` — body `{ email }`. Mails a code
 *   and returns opaque challenge metadata for both existing and new users.
 * - `POST /v1/auth/email-otp/verify` — body `{ challengeId, code }`. On match,
 *   issues a session, sets cookies, and returns a `TokenPair`.
 *
 * Schemas use `.strict()` so unknown keys produce 400. The shared
 * `emailSchema` and `otpCodeSchema` fragments (see
 * `v1.common.*`) carry the actual validation rules.
 */
import { z } from "zod";

import { emailSchema, otpCodeSchema } from "../common/common.schemas";
import {
  otpChallengeIdSchema,
  otpChallengeMetadataSchema,
} from "./otp-challenge.schemas";

export const requestEmailOtpInputSchema = z
  .object({
    email: emailSchema.describe(
      "Email address to send the one-time code to. Treated case-insensitively.",
    ),
  })
  .strict()
  .meta({ id: "RequestEmailOtpInput" });

export const verifyEmailOtpInputSchema = z
  .object({
    challengeId: otpChallengeIdSchema,
    code: otpCodeSchema.describe(
      'The 6-digit one-time code. In non-production `NODE_ENV`, the API accepts the literal `"000000"`.',
    ),
  })
  .strict()
  .meta({ id: "VerifyEmailOtpInput" });

export type RequestEmailOtpInput = z.infer<typeof requestEmailOtpInputSchema>;
export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpInputSchema>;

export const emailOtpChallengeSchema = otpChallengeMetadataSchema;
export type EmailOtpChallenge = z.infer<typeof emailOtpChallengeSchema>;
