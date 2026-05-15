/**
 * NestJS DTO wrappers for the core-auth controller's response bodies.
 *
 * Each class extends `createZodDto(...)` over a schema in
 * `@repo/api-shared` — the schema is the contract, the class is the
 * NestJS-compatible vessel that `@ZodResponse({ type })` /
 * `@ApiOkResponse({ type })` decorators need at runtime.
 *
 * Field-level metadata (types, descriptions, nullability) lives in the
 * schema; nestjs-zod's patched Swagger metadata factory emits the
 * OpenAPI doc from `z.toJSONSchema()` and `cleanupOpenApiDoc()` renames
 * the components by `.meta({ id })`. No `@ApiProperty` decorators here.
 */
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class SessionUserResponse extends createZodDto(
  v1.auth.sessionUserResponseSchema,
) {}

export class SessionSummaryResponse extends createZodDto(
  v1.auth.sessionSummaryResponseSchema,
) {}

export class TokenPairResponse extends createZodDto(
  v1.auth.tokenPairResponseSchema,
) {}

export class EnabledAuthMethodsResponse extends createZodDto(
  v1.auth.enabledAuthMethodsResponseSchema,
) {}

export class LogoutAllResponse extends createZodDto(
  v1.auth.logoutAllResponseSchema,
) {}
