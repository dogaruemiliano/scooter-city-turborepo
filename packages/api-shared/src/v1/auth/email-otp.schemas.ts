/**
 * Zod schemas for the email-OTP auth method.
 *
 * Two endpoints:
 *
 * - `POST /v1/auth/email-otp/request` — body `{ email }`. Mails a fresh
 *   6-digit code to the user. Returns 202 with a constant
 *   `{ status: "sent" }` regardless of whether the email is known
 *   (anti-enumeration).
 * - `POST /v1/auth/email-otp/verify` — body `{ email, code }`. On match,
 *   issues a session, sets cookies, and returns a `TokenPair`.
 *
 * Schemas use `.strict()` so unknown keys produce 400. The shared
 * `emailSchema` and `otpCodeSchema` fragments (see
 * `v1.common.*`) carry the actual validation rules.
 */
import { z } from "zod";

import { emailSchema, otpCodeSchema } from "../common/common.schemas";

export const emailOtpRequestSchema = z
  .object({
    email: emailSchema.describe(
      "Email address to send the one-time code to. Treated case-insensitively (normalized to lowercase before lookup).",
    ),
  })
  .strict()
  .meta({ id: "EmailOtpRequest" });

export const emailOtpVerifySchema = z
  .object({
    email: emailSchema.describe(
      "Email address that received the code. Must match the address used in the preceding /request call.",
    ),
    code: otpCodeSchema.describe(
      'The 6-digit one-time code. In non-production `NODE_ENV`, the API accepts the literal `"000000"`.',
    ),
  })
  .strict()
  .meta({ id: "EmailOtpVerify" });

export type EmailOtpRequestInput = z.infer<typeof emailOtpRequestSchema>;
export type EmailOtpVerifyInput = z.infer<typeof emailOtpVerifySchema>;

/**
 * Response body for `POST /v1/auth/email-otp/request`. Constant payload
 * (`{ status: "sent" }`) returned regardless of whether the email
 * matched a real user — disclosing the difference would defeat the
 * anti-enumeration goal.
 */
export const otpRequestResponseSchema = z
  .object({
    status: z
      .literal("sent")
      .describe(
        "Constant acknowledgement of the request. Returned unconditionally — whether the email matched a real user is intentionally not disclosed (anti-enumeration).",
      ),
  })
  .meta({ id: "OtpRequestResponse" });

export type OtpRequestResponseBody = z.infer<typeof otpRequestResponseSchema>;
