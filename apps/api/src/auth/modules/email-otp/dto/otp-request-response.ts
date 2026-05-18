/**
 * Naming exception: keeps the `Response` suffix (matches the schema's
 * `.meta({ id: "OtpRequestResponse" })`). The body is a constant
 * `{ status: "sent" }` ack with no clean resource noun — bare
 * `OtpRequest` would collide with the input concept. Mirrors
 * `SmsOtpRequestResponse` in the sms-otp module.
 */
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class OtpRequestResponse extends createZodDto(
  v1.auth.otpRequestResponseSchema,
) {}
