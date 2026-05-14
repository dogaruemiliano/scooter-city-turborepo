/**
 * Request body for `POST /v1/auth/google`.
 *
 * The validation rules and OpenAPI description live in
 * `v1.auth.googleSigninSchema`. This class is the NestJS wrapper that
 * lets us write `@Body() dto: GoogleSigninDto` while keeping the schema
 * the single source of truth.
 */
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class GoogleSigninDto extends createZodDto(v1.auth.googleSigninSchema) {}
