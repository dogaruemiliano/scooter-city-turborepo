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
 *
 * Naming exception: `otpRequestResponseSchema` keeps the `Response`
 * suffix (and so does the NestJS class `OtpRequestResponse`). The body
 * is a constant ack with no resource-style noun — bare `OtpRequest`
 * would collide with the input concept, so the suffix stays for this
 * one. Mirrors `smsOtpRequestResponseSchema` in `sms-otp.schemas.ts`.
 */
import { z } from "zod";

import { emailSchema, otpCodeSchema } from "../common/common.schemas";

export const requestEmailOtpInputSchema = z
  .object({
    email: emailSchema.describe(
      "Email address to send the one-time code to. Treated case-insensitively (normalized to lowercase before lookup).",
    ),
  })
  .strict()
  .meta({ id: "RequestEmailOtpInput" });

export const verifyEmailOtpInputSchema = z
  .object({
    email: emailSchema.describe(
      "Email address that received the code. Must match the address used in the preceding /request call.",
    ),
    code: otpCodeSchema.describe(
      'The 6-digit one-time code. In non-production `NODE_ENV`, the API accepts the literal `"000000"`.',
    ),
  })
  .strict()
  .meta({ id: "VerifyEmailOtpInput" });

export type RequestEmailOtpInput = z.infer<typeof requestEmailOtpInputSchema>;
export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpInputSchema>;

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

export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;
