/**
 * Request body for `POST /v1/auth/apple`.
 *
 * Wraps `v1.auth.appleSigninSchema` so NestJS can validate the body via
 * the global `ZodValidationPipe`. The schema lives in `@repo/api-shared`
 * — keep validation rules there, never here.
 */
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class AppleSigninDto extends createZodDto(v1.auth.appleSigninSchema) {}
