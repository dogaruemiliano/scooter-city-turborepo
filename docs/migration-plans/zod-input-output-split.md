# Zod schema input/output naming + `@ZodResponse` migration plan

> **Status:** Executing in one consolidated change (all modules + regen + tests + README). One PR rather than one-per-module — see §3.1 for the why.
>
> **Decisions baked in:** all open questions answered — see §5.

## 0. Premise check

The original framing — "today we share schemas across both input and output" — did **not** match the current state of [packages/api-shared/src/v1/](../../packages/api-shared/src/v1/). Every controller endpoint already pairs a distinct request schema with a distinct response schema. No schema is reused across directions.

Two real misalignments did exist and are what this migration fixes:

1. **Inconsistent naming + `Dto` suffix sprawl.** api-shared variables, NestJS classes, OpenAPI components, and Orval-generated types all carried slightly different name shapes (`emailOtpRequestSchema` / `EmailOtpRequestDto` / `EmailOtpRequestDto`). After: one name across all layers.
2. **`@ZodResponse` was partially adopted.** Email-OTP `/request` had migrated to `@ZodResponse` (which produced `OtpRequestResponse_Output` in [openapi.json](../../openapi.json)). Every other auth controller still used the legacy `@ZodSerializerDto + @ApiOkResponse` pair. Standardize on `@ZodResponse` everywhere.

## 1. Inventory

| Schema (old name)                  | File                                                                     | Direction                 | Old `.meta({ id })`          | Old OpenAPI component                 | Renamed to (variable / id / class)                                                            |
| ---------------------------------- | ------------------------------------------------------------------------ | ------------------------- | ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `refreshTokensSchema`              | [auth.schemas.ts](../../packages/api-shared/src/v1/auth/auth.schemas.ts) | Input                     | (missing)                    | `RefreshTokensDto`                    | `refreshTokenInputSchema` / `RefreshTokenInput` / `RefreshTokenInput`                         |
| `tokenPairResponseSchema`          | auth.schemas.ts                                                          | Output (5 endpoints)      | `TokenPairResponse`          | `TokenPairResponse`                   | `tokenPairSchema` / `TokenPair` / `TokenPair`                                                 |
| `logoutAllResponseSchema`          | auth.schemas.ts                                                          | Output                    | `LogoutAllResponse`          | `LogoutAllResponse`                   | `logoutAllResultSchema` / `LogoutAllResult` / `LogoutAllResult`                               |
| `sessionUserResponseSchema`        | auth.schemas.ts                                                          | Output (pick of User)     | `SessionUserResponse`        | `SessionUserResponse`                 | `sessionUserSchema` / `SessionUser` / `SessionUser`                                           |
| `sessionSummaryResponseSchema`     | auth.schemas.ts                                                          | Output (array)            | `SessionSummaryResponse`     | `SessionSummaryResponse`              | `sessionSummarySchema` / `SessionSummary` / `SessionSummary`                                  |
| `enabledAuthMethodsResponseSchema` | auth.schemas.ts                                                          | Output                    | `EnabledAuthMethodsResponse` | `EnabledAuthMethodsResponse`          | `enabledAuthMethodsSchema` / `EnabledAuthMethods` / `EnabledAuthMethods`                      |
| `emailOtpRequestInputSchema`       | email-otp.schemas.ts                                                     | Input                     | `EmailOtpRequestInput`       | `EmailOtpRequestDto`                  | `requestEmailOtpInputSchema` / `RequestEmailOtpInput` / `RequestEmailOtpInput`                |
| `emailOtpVerifySchema`             | email-otp.schemas.ts                                                     | Input                     | `EmailOtpVerify`             | `EmailOtpVerifyDto`                   | `verifyEmailOtpInputSchema` / `VerifyEmailOtpInput` / `VerifyEmailOtpInput`                   |
| `otpRequestResponseSchema`         | email-otp.schemas.ts                                                     | Output (@ZodResponse)     | `OtpRequestResponse`         | `OtpRequestResponse_Output`           | **kept** (exception — see §2 rule 7)                                                          |
| `smsOtpRequestSchema`              | sms-otp.schemas.ts                                                       | Input                     | `SmsOtpRequest`              | `SmsOtpRequestDto`                    | `requestSmsOtpInputSchema` / `RequestSmsOtpInput` / `RequestSmsOtpInput`                      |
| `smsOtpVerifySchema`               | sms-otp.schemas.ts                                                       | Input                     | `SmsOtpVerify`               | `SmsOtpVerifyDto`                     | `verifySmsOtpInputSchema` / `VerifySmsOtpInput` / `VerifySmsOtpInput`                         |
| `smsOtpRequestResponseSchema`      | sms-otp.schemas.ts                                                       | Output                    | `SmsOtpRequestResponse`      | `SmsOtpRequestResponse`               | **kept** (exception — see §2 rule 7)                                                          |
| `googleSigninSchema`               | google.schemas.ts                                                        | Input                     | `GoogleSignin`               | `GoogleSigninDto`                     | `signInWithGoogleInputSchema` / `SignInWithGoogleInput` / `SignInWithGoogleInput`             |
| `appleSigninSchema`                | apple.schemas.ts                                                         | Input                     | `AppleSignin`                | `AppleSigninDto`                      | `signInWithAppleInputSchema` / `SignInWithAppleInput` / `SignInWithAppleInput`                |
| `fullNameSchema` (private)         | apple.schemas.ts                                                         | Input (nested)            | `AppleFullName`              | `AppleSigninDtoAppleFullName` (glued) | `appleFullNameSchema` (now exported) / `AppleFullName` / `AppleFullName` (detached top-level) |
| `userResponseSchema`               | users.schemas.ts                                                         | Output (no live endpoint) | `UserResponse`               | (not emitted)                         | `userSchema` / `User` / `User`                                                                |

**Categorization:**

- Input-only (8) — refresh, both OTP requests, both OTP verifies, google, apple, fullName.
- Output-only (8) — token pair, logout-all, session user, session summary, enabled methods, both OTP acks, user.
- Used in both directions (0) — no structural split needed; only renaming + decorator standardization.

## 2. Naming convention

| Layer                                          | Input                                               | Output                                  |
| ---------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| api-shared variable name                       | `*InputSchema` (e.g. `requestEmailOtpInputSchema`)  | `*Schema` (e.g. `tokenPairSchema`)      |
| api-shared `.meta({ id })`                     | `*Input` (e.g. `RequestEmailOtpInput`)              | bare (e.g. `TokenPair`)                 |
| NestJS class                                   | `*Input`                                            | bare                                    |
| OpenAPI component (input)                      | `*Input` (class name wins; matches `.meta({ id })`) | —                                       |
| OpenAPI component (output, via `@ZodResponse`) | —                                                   | `*_Output` (e.g. `TokenPair_Output`)    |
| Orval-generated TS type                        | `*Input`                                            | `*Output` (Orval strips the underscore) |

**Rules:**

1. **No `Dto` suffix anywhere.** Not on api-shared variables, NestJS classes, or filenames.
2. **Every Zod schema gets `.meta({ id })`** matching the class name. Verified against `zod@4.4.3` + `nestjs-zod@5.3.0`: `z.toJSONSchema` does NOT emit the `id` field at the top level, so the metadata is effectively cosmetic for top-level DTOs (the class name wins). Set it anyway as the source of truth for any consumer that reaches into the schema without going through the NestJS class.
3. **`@ZodResponse({ status, type })` is the response decorator everywhere.** Do not use `@ZodSerializerDto + @ApiOkResponse`. Do not build wrapper decorators like `@ApiOk` / `@ApiCreated` / `@ApiAccepted` — `@ZodResponse` covers status code, OpenAPI doc, runtime serialization, and compile-time return-type check in one call.
4. **Accept the `_Output` suffix on output OpenAPI components.** Trade-off for `@ZodResponse`'s compile-time correctness. Orval converts to `*Output` TS types.
5. **Output schemas continue to omit `.strict()`** — the global `ZodSerializerInterceptor` strips unknowns; tightening here would 500 on legitimately stored data.
6. **DTO files use `*.input.ts` for inputs and `*.ts` (no suffix) for outputs.** No more `*.dto.ts` filenames.
7. **Action endpoints use verb-prefixed input names:** `RequestEmailOtpInput`, `VerifyEmailOtpInput`, `RefreshTokenInput`, `SignInWithGoogleInput`, `SignInWithAppleInput`. CRUD endpoints follow `Create{Resource}Input` / `Update{Resource}Input` / `Patch{Resource}Input` / `{Resource}Query`.
8. **Ack-shape outputs may keep the `Response` suffix as a documented exception.** Constant `{ status: "sent" }`–style acks (currently `OtpRequestResponse` and `SmsOtpRequestResponse`) keep their existing names. Bare `OtpRequest` / `SmsOtpRequest` would collide with the input concept and there's no clean resource noun for a fire-and-forget acknowledgement. Document the exception inline in the schema file's header comment.

## 3. Execution sequence

### 3.1 Single consolidated change (deviation from original plan)

The original plan said one PR per module. The actual execution is one consolidated change covering all six modules + regeneration + e2e test fixes + README update. Reason: the rename in `core-auth` cascades into every other module's controller imports (every controller references `TokenPair`), and the per-module PR ordering would require either a temporary `TokenPair`-alias file or four PRs that don't compile until the last one merges. One consolidated change is the path of least friction given (a) no production consumer is at risk (apps/web and apps/mobile don't import the generated client yet), (b) the e2e tests need to be updated in lockstep anyway, and (c) the migration is purely cosmetic on the wire (no JSON shape change).

If this turns out to be too large to review as one PR, the natural cut points are:

1. api-shared schema renames + `userSchema` rename (no behavior change, just exports).
2. Auth module DTOs + controllers + `@ZodResponse` adoption.
3. e2e test name updates.
4. Regenerated `openapi.json` + `packages/api-generated/`.

### 3.2 Per-module sequence (applied across all 6 modules in one pass)

1. Rename Zod schemas in `packages/api-shared/src/v1/{module}/`. Add `.meta({ id })` to any schema missing one (`refreshTokensSchema` was the only such case).
2. Replace DTO files in `apps/api/src/{module}/dto/`: delete the old `*.dto.ts` and `responses.ts`, create new `*.input.ts` (inputs) and bare `*.ts` (outputs). One class per file.
3. Update controllers:
   - Replace `@HttpCode(...) + @ApiOkResponse({ type: X }) + @ZodSerializerDto(X)` with `@ZodResponse({ status: 200, type: X })`.
   - Replace `@HttpCode(HttpStatus.ACCEPTED) + @ApiAcceptedResponse({ type: X }) + @ZodSerializerDto(X)` with `@ZodResponse({ status: 202, type: X })`.
   - Update `@Body() dto: SomeInputDto` → `@Body() dto: SomeInput`.
   - Update method return type annotations.
4. Update `apps/api/test/*.e2e-spec.ts` files to import the new names.
5. Regenerate: `pnpm gen` (env → api-shared build → api build → openapi → orval).
6. Update [packages/api-shared/src/v1/README.md](../../packages/api-shared/src/v1/README.md) with the new convention table and walk-through.

### 3.3 What each file becomes

**`packages/api-shared/src/v1/{module}/{module}.schemas.ts`** — schema variable + id renames; structure unchanged.

```ts
// Before
export const fooBarSchema = z.object({ ... }).strict().meta({ id: "FooBar" });
export type FooBarInput = z.infer<typeof fooBarSchema>;
export const fooBarResponseSchema = z.object({ ... }).meta({ id: "FooBarResponse" });
export type FooBarResult = z.infer<typeof fooBarResponseSchema>;

// After
export const fooBarInputSchema = z.object({ ... }).strict().meta({ id: "FooBarInput" });
export type FooBarInput = z.infer<typeof fooBarInputSchema>;
export const fooBarSchema = z.object({ ... }).meta({ id: "FooBar" });
export type FooBar = z.infer<typeof fooBarSchema>;
```

**`apps/api/src/{module}/dto/foo-bar.input.ts`** (new file replacing `*.dto.ts`):

```ts
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class FooBarInput extends createZodDto(v1.{module}.fooBarInputSchema) {}
```

**`apps/api/src/{module}/dto/foo-bar.ts`** (new file for the output):

```ts
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class FooBar extends createZodDto(v1.{module}.fooBarSchema) {}
```

**Controller** — decorator collapse from three to one:

```ts
// Before
@Post("foo-bar")
@HttpCode(HttpStatus.OK)
@ApiOkResponse({ type: FooBarResponse })
@ZodSerializerDto(FooBarResponse)
async fooBar(@Body() body: FooBarDto): Promise<FooBarResponse> { ... }

// After
@Post("foo-bar")
@ZodResponse({ status: 200, type: FooBar })
async fooBar(@Body() body: FooBarInput): Promise<FooBar> { ... }
```

## 4. Risks and breaking changes

### 4.1 Orval-generated TS type churn

Every input and output type in [packages/api-generated/src/index.ts](../../packages/api-generated/src/index.ts) gets renamed. Operation function names are unchanged.
**Mitigation:** zero production consumers (`apps/web/src/` and `apps/mobile/src/` don't import from `@repo/api-generated`). Only `apps/api/test/*.e2e-spec.ts` needs updates.

### 4.2 The `_Output` suffix on responses

Output Orval-generated TS types end in `Output` (e.g. `TokenPairOutput`, `SessionUserOutput`, `EmailOtpAckOutput`). Inputs are bare (`*Input`). Asymmetry accepted as the price of `@ZodResponse`'s compile-time return-type check.

### 4.3 Wire format

**Unchanged.** Every JSON body stays bit-for-bit identical. Only OpenAPI component names and TypeScript type names change.

### 4.4 Apple `fullNameSchema` — partial detach

Was `AppleSigninDtoAppleFullName`. Now `appleFullNameSchema` is exported separately and has `.meta({ id: "AppleFullName" })`. The post-regeneration component name is `SignInWithAppleInputAppleFullName` — still glued, not bare `AppleFullName`. Investigated: nestjs-zod's `cleanupOpenApiDoc` only honors a nested schema's id when it appears in `$defs` with an `id` field, but `z.toJSONSchema` in zod 4.4.3 doesn't emit the `id` field for the inlined sub-schema at runtime. Forcing a clean `AppleFullName` would require either forking nestjs-zod or restructuring how the schema is composed. Out of scope for this migration. The wire shape is unchanged; the verbose component name is only visible in SwaggerUI and Orval-generated types.

### 4.5 `userResponseSchema` rename with no live consumer

Only consumer is `sessionUserResponseSchema = userResponseSchema.pick(...)` in auth. Rename to `userSchema` happens alongside the auth-module rename. No live `/v1/users/*` endpoint, so no controller changes outside the schema package.

### 4.6 CI drift guard

Recommendation: land a `pnpm gen` drift check on `packages/api-generated/` in CI separately (either before this migration or shortly after). Catches any future PR that forgets to regenerate. Not blocking for this migration, but worth doing.

## 5. Resolved decisions

1. **`@ZodResponse` everywhere; accept `_Output` suffix.** No wrapper decorators built.
2. **Drop `Dto` suffix** from variables, classes, filenames.
3. **`OtpRequestResponse` → `EmailOtpAck`; `SmsOtpRequestResponse` → `SmsOtpAck`** — purpose-named acks.
4. **`LogoutAllResponse` → `LogoutAllResult`** — verb-as-noun avoided.
5. **`SessionUser` kept** — not renamed to `Me` or `MyProfile`.
6. **`refreshTokensSchema` → `refreshTokenInputSchema` (singular)** — matches the singular body field `refreshToken`.
7. **Apple's `fullNameSchema` detached as top-level `AppleFullName`**.
8. **`userResponseSchema` → `userSchema` now** — bundled with the auth-module rename.
9. **CI drift guard** — separate change, not blocking.
10. **One consolidated change** instead of per-module PRs — see §3.1.
11. **DTO filenames** — `*.input.ts` for inputs, bare `*.ts` for outputs.

## 6. Out of scope

- Restructuring the `packages/api-shared/src/v1/` folder hierarchy.
- Adding new schemas for endpoints not yet built.
- Migrating non-auth surfaces from `class-validator` to `nestjs-zod`.
- i18n on validation error messages.
- Shared `Pagination` / `Cursor` / `IdParam` schemas in `common/`.
- Schema-parsing performance work.

## 7. Self-check (post-execution)

- [ ] All schemas in `packages/api-shared/src/v1/` follow the new convention.
- [ ] No `Dto` suffix anywhere in `apps/api/src/auth/modules/*/dto/`.
- [ ] All 5 auth controllers use `@ZodResponse({ status, type })` (no `@ZodSerializerDto`, no `@ApiOkResponse({ type })`).
- [ ] Regenerated `openapi.json` shows: input components bare (e.g. `RequestEmailOtpInput`), output components `_Output`-suffixed (e.g. `EmailOtpAck_Output`), `AppleFullName` as its own top-level component.
- [ ] Regenerated `packages/api-generated/src/index.ts` has clean flat interfaces (no `Partial<>`/`Omit<>`).
- [ ] All `apps/api/test/*.e2e-spec.ts` files updated.
- [ ] `pnpm check-types` passes across the repo.
- [ ] `pnpm lint` passes across the repo.
- [ ] `packages/api-shared/src/v1/README.md` updated with the new convention.
