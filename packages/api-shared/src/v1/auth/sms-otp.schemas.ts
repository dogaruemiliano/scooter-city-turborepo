/**
 * Zod schemas for the SMS-OTP auth method.
 *
 * Two endpoints:
 *
 * - `POST /v1/auth/sms-otp/request` — body `{ phone }`. Sends a fresh
 *   6-digit code via SMS to the user. Returns 202 with a constant
 *   `{ status: "sent" }` regardless of whether the phone is known
 *   (anti-enumeration).
 * - `POST /v1/auth/sms-otp/verify` — body `{ phone, code }`. On match,
 *   issues a session, sets cookies, and returns a `TokenPair`.
 *
 * Schemas use `.strict()` so unknown keys produce 400. The shared
 * `phoneSchema` (E.164) and `otpCodeSchema` fragments (see
 * `v1.common.*`) carry the actual validation rules.
 */
import { z } from "zod";

import { otpCodeSchema, phoneSchema } from "../common/common.schemas";

export const smsOtpRequestSchema = z
  .object({
    phone: phoneSchema.describe(
      "Phone number to send the one-time code to, in E.164 format (e.g. +40712345678).",
    ),
  })
  .strict()
  .meta({ id: "SmsOtpRequest" });

export const smsOtpVerifySchema = z
  .object({
    phone: phoneSchema.describe(
      "Phone number that received the code. Must match the number used in the preceding /request call.",
    ),
    code: otpCodeSchema.describe(
      'The 6-digit one-time code. In non-production `NODE_ENV`, the API accepts the literal `"000000"`.',
    ),
  })
  .strict()
  .meta({ id: "SmsOtpVerify" });

export type SmsOtpRequestInput = z.infer<typeof smsOtpRequestSchema>;
export type SmsOtpVerifyInput = z.infer<typeof smsOtpVerifySchema>;

/**
 * Response body for `POST /v1/auth/sms-otp/request`. Constant payload
 * (`{ status: "sent" }`) returned regardless of whether the phone
 * matched a real user — disclosing the difference would defeat the
 * anti-enumeration goal (mirrors email-OTP).
 */
export const smsOtpRequestResponseSchema = z
  .object({
    status: z
      .literal("sent")
      .describe(
        "Constant acknowledgement of the request. Returned unconditionally — whether the phone matched a real user is intentionally not disclosed (anti-enumeration).",
      ),
  })
  .meta({ id: "SmsOtpRequestResponse" });

export type SmsOtpRequestResponseBody = z.infer<
  typeof smsOtpRequestResponseSchema
>;
