/**
 * Naming exception: keeps the `Response` suffix (matches the schema's
 * `.meta({ id: "SmsOtpRequestResponse" })`). See
 * `email-otp/dto/otp-request-response.ts` for the rationale.
 */
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class SmsOtpRequestResponse extends createZodDto(
  v1.auth.smsOtpRequestResponseSchema,
) {}
