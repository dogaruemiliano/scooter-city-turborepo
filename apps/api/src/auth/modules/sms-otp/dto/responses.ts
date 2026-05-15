/**
 * NestJS DTO wrapper for the SMS-OTP `/request` response.
 *
 * `TokenPairResponse` already lives in core-auth; `/verify` reuses it
 * directly. Only the constant `{ status: "sent" }` payload is new.
 * The schema lives in `@repo/api-shared`
 * (`v1.auth.smsOtpRequestResponseSchema`); this class is the
 * NestJS-compatible vessel for `@ZodResponse({ type })`.
 */
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class SmsOtpRequestResponse extends createZodDto(
  v1.auth.smsOtpRequestResponseSchema,
) {}
