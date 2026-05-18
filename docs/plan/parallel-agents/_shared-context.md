# Shared context for the parallel auth-method agents

Every agent prompt under this directory **starts** by saying:

> Read `docs/plan/parallel-agents/_shared-context.md` and `AGENTS.md` end-to-end before writing any code.

That instruction targets this file. Internalize the conventions below before touching anything.

## Repository

- Turborepo monorepo at `/Users/emilianodogaru/code/dectech/turborepo-full-template-v2`.
- pnpm workspace. Use `pnpm add <pkg>` from the relevant package directory — never hand-edit `package.json`.
- Apps: `apps/api` (NestJS 11). Packages: `packages/api-shared` (hand-written contracts), `packages/api-generated` (Orval output, do not edit).
- Database: Postgres 16 in Docker on **port 5434** (not 5432). Compose file at the repo root.

## Hard rules

1. **Prisma 7 — verify the docs.** `AGENTS.md` carries a `prisma-verify-rule` block. The schema, generator, driver-adapter shape, and CLI behavior all changed in v7. Do not write Prisma code from memory; read the installed `.d.ts` or current docs. Generated client lives at `apps/api/src/generated/prisma/` and is imported from `../generated/prisma/client`, **not** from `@prisma/client`.
2. **No new theme literals.** Color/spacing/etc. tokens live in `packages/theme/` — but you should not be touching the theme in an auth-method PR. If you must, see `AGENTS.md`.
3. **No tRPC.** REST + OpenAPI is the contract. tRPC procedures, contexts, and clients are forbidden.
4. **No bcrypt.** Credentials (email+password) are out of scope. The only password-style hashing in the codebase is bcrypt-for-passwords; that whole code path is removed. OTPs and refresh tokens use SHA-256 HMAC via [`apps/api/src/auth/utils/hash.ts`](../../../apps/api/src/auth/utils/hash.ts).
5. **No Facebook OAuth.** Dropped from v1.
6. **Don't sleep without a reason.** No `await new Promise(r => setTimeout(r, …))` to "wait for the DB". If a test needs deterministic time, advance Jest fake timers.
7. **No new comments for the obvious.** Comments explain _why_, never _what_. Reserved for: timing-attack defenses, race-condition mitigations, provider-specific quirks (Apple email-on-first-login), security-sensitive branches. See `CLAUDE.md` for full rules.

## Architecture

### `@repo/api-shared` — versioned `v1.*` namespace

Single import per consumer:

```ts
import { v1 } from "@repo/api-shared";

v1.auth.refreshTokensSchema; // zod schema for /v1/auth/refresh body
v1.auth.ROUTES.emailOtp.request; // "/v1/auth/email-otp/request"
v1.auth.ACCESS_TOKEN_COOKIE; // "access_token"
v1.auth.SessionUser; // type
v1.common.emailSchema; // shared zod fragment (RFC-5321, accepts privaterelay.appleid.com)
v1.common.otpCodeSchema; // 6-digit numeric string
v1.common.phoneSchema; // E.164
```

Source layout:

```
packages/api-shared/src/v1/auth/
├── index.ts                # barrel — export per-method schemas here
├── auth.constants.ts       # cookies + ROUTES (PR 5 added ROUTES.emailOtp/.smsOtp/.google/.apple stubs)
├── auth.types.ts           # SessionUser, SessionSummary, TokenPair, EnabledAuthMethods
├── auth.schemas.ts         # refreshTokensSchema only — DO NOT pile per-method schemas here
└── <method>.schemas.ts     # YOUR new schemas file, one per method (you create this)
```

### Schemas as source of truth

Every request body has a zod schema in `@repo/api-shared`. The schema:

- Is `.strict()` so unknown keys produce 400.
- Uses `.describe(...)` on individual fields to drive the OpenAPI `description`.
- Uses `.meta({ id: "SchemaName" })` on the top-level object so the OpenAPI schema name matches the DTO class name.
- Re-uses `v1.common.*` fragments (`emailSchema`, `phoneSchema`, `otpCodeSchema`) — don't redefine them.

### DTOs via `nestjs-zod`

```ts
// apps/api/src/auth/modules/<method>/dto/<endpoint>.dto.ts
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class EmailOtpRequestDto extends createZodDto(
  v1.auth.emailOtpRequestInputSchema,
) {}
```

The global `ZodValidationPipe` (registered as `APP_PIPE` in `app.module.ts`) runs the schema. No `class-validator`, no `class-transformer`, no manual `ValidationPipe` invocation.

### Controllers

- Path: `@Controller({ path: "auth/<method>", version: "1" })` → routes resolve under `/v1/auth/<method>/...`.
- `@ApiTags("auth")` and `@ApiCookieAuth(v1.auth.ACCESS_TOKEN_COOKIE)` at the class level.
- Per-method routes mark `@Public()` for the unauthenticated endpoints (request/verify, sign-in). The global `JwtAuthGuard` honors that decorator.
- `@ApiOperation({ summary, description })` and `@ApiOkResponse({ type: SomeDto })` / `@ApiNoContentResponse()` on every route.
- Always read IP + UA the same way `CoreAuthController` does (`requestIp(req)` helper + `req.header("user-agent") ?? null`).

Study [`core-auth.controller.ts`](../../../apps/api/src/auth/modules/core-auth/core-auth.controller.ts) end-to-end. Copy its decorator stack, IP helper, audit emission shape, and cookie-write pattern. Do not invent variations.

### Services

- Inject `CoreAuthService` (re-exported from `CoreAuthModule`) and call `coreAuth.issueSession({ user, userAgent, ip })` after the method verifies its evidence.
- Inject `PrismaService` for direct DB writes (`OtpToken`, `AuthAccount`).
- Inject `AuditService` for `audit.record(...)`.
- Inject `MailerService` (email-OTP) or `SmsService` (sms-OTP) for delivery.
- Inject `@Inject(ENV) env: Env` for env access — never read `process.env` directly inside a service.

### Module wiring

```ts
@Module({
  imports: [
    JwtModule,        // only if you mint or verify JWTs directly (OAuth uses jose, not JwtModule)
    UsersModule,      // for UsersService
    // CoreAuthModule is already in AuthModule.forRoot()'s graph — DO NOT import it locally
  ],
  controllers: [<Method>Controller],
  providers: [<Method>Service],
})
export class <Method>Module {}
```

**Sibling-module sharing rule:** Nest deduplicates registrations. Each sibling re-imports `JwtModule` / `UsersModule` locally if it injects from them. **Never** mark anything `@Global()` to "solve sharing." This rule is documented in the user's memory and is non-negotiable.

### CoreAuthService integration

```ts
const issued = await this.coreAuth.issueSession({
  user: { id: user.id, email: user.email },
  userAgent: req.header("user-agent") ?? null,
  ip: requestIp(req),
});

setAuthCookies(res, this.env, {
  accessToken: issued.accessToken,
  refreshToken: issued.refreshToken,
  accessTokenExpiresInSec: issued.accessTokenExpiresInSec,
  refreshTokenExpiresInSec: issued.refreshTokenExpiresInSec,
});

return {
  accessToken: issued.accessToken,
  refreshToken: issued.refreshToken,
};
```

Cookie helpers + IP extractor live next to `core-auth.controller.ts` — import, don't reimplement.

### Audit emission

```ts
await this.audit.record({
  type: AuditEventType.LOGIN_SUCCESS,
  userId: user.id,
  ip: requestIp(req),
  userAgent: req.header("user-agent") ?? null,
  meta: { method: "email-otp" }, // method discriminator
});
```

If your module needs a new event type, append to [`apps/api/src/audit/audit.types.ts`](../../../apps/api/src/audit/audit.types.ts) and flag it in your `[INTEGRATION]` section.

### Throttler

Named buckets are already registered. Apply to your endpoints:

```ts
import { Throttle } from "@nestjs/throttler";

@Throttle({
  "otp-ip":           { limit: env.THROTTLE_OTP_PER_IP_PER_HOUR,     ttl: 3_600_000 },
  "otp-target":       { limit: env.THROTTLE_OTP_PER_TARGET_PER_HOUR, ttl: 3_600_000 },
  "otp-target-daily": { limit: env.THROTTLE_OTP_PER_TARGET_PER_DAY,  ttl: 86_400_000 },
})
@Post("request")
async request(...) { ... }
```

The `otp-target` bucket needs a custom tracker that keys on the request's email/phone — extend the existing `CustomThrottlerGuard` (see [`auth/guards/throttler.guard.ts`](../../../apps/api/src/auth/guards/throttler.guard.ts) if it exists, otherwise the bucket falls back to IP). Don't redesign the tracker; document the gap in your summary if a working tracker doesn't exist yet.

### Hashing

```ts
import { hashOtp, safeEqualHex } from "../../utils/hash";

const codeHash = hashOtp(plaintext, this.env.OTP_HMAC_SECRET);
const equal = safeEqualHex(presentedHash, storedHash);
```

### OTP code generation (the `"000000"` rule)

Production: `OTP_LENGTH` crypto-random digits (default 6) using `node:crypto`. Non-production (`NODE_ENV !== "production"`): the literal string `"000000"`. This is purely `NODE_ENV`-derived — no separate flag. Implement at the module level. If two OTP modules want the same helper, the first agent to merge creates `apps/api/src/auth/utils/otp-code.ts` and the second uses it. State in your `[INTEGRATION]` whether you created it.

### Anti-enumeration

For `request` endpoints that accept an email/phone:

- Look up the user. If absent, **still wait** the same amount of time you'd wait on a real send (constant-time response).
- Always return the same response shape regardless of whether the user existed. Never expose "no such user" via timing or response.

### OAuth auto-linking

For OAuth methods (Google, Apple):

- Verify the provider's ID token.
- If `email_verified === true` (Google) OR Apple's `sub` matches an existing `AuthAccount` row, you may link/login.
- If the provider's email is **not** verified AND a user with that email already exists with no matching `AuthAccount`, return **409 Conflict** with a message instructing the user to log in via another method and link from settings.
- Apple-specific: persist the email **only on the first sign-in** (`sub` is unique per app). Subsequent logins omit the email claim.

## File-level constraints

### YOU MUST create

- `apps/api/src/auth/modules/<method>/<method>.module.ts`
- `apps/api/src/auth/modules/<method>/<method>.service.ts`
- `apps/api/src/auth/modules/<method>/<method>.controller.ts`
- `apps/api/src/auth/modules/<method>/dto/<endpoint>.dto.ts` (one per endpoint)
- `packages/api-shared/src/v1/auth/<method>.schemas.ts`
- `apps/api/test/<method>.e2e-spec.ts`
- `docs/auth/<topic>.md` (your specified doc)

### YOU MAY append to (single-line additive changes — flag them in `[INTEGRATION]`)

- `packages/api-shared/src/v1/auth/index.ts` — re-export your new schemas file
- `apps/api/src/audit/audit.types.ts` — new audit event types
- `apps/api/src/auth/auth.module.ts` — your conditional `imports.push(<Method>Module)` inside `forRoot()`
- `CHANGELOG.md` — your "Added — PR N" section

### YOU MUST NOT modify

- `apps/api/src/auth/modules/core-auth/**` — core is frozen
- `apps/api/src/auth/utils/**` (except adding a single new file you own)
- `apps/api/src/config/env.ts` — env vars for your method already exist
- `apps/api/prisma/schema.prisma` — schema is frozen
- `packages/api-shared/src/v1/auth/auth.schemas.ts` — keep this for refresh only
- Any file owned by another method module

## Tests

- Per-worker Postgres schema via Jest `JEST_WORKER_ID` — parallel-safe, no `--runInBand`.
- E2E tests boot the full `AppModule` and use Supertest. Pattern is verbatim what [`apps/api/test/core-auth-controller.e2e-spec.ts`](../../../apps/api/test/core-auth-controller.e2e-spec.ts) does.
- Service-level unit tests where the logic is non-trivial (rotation, verification). Pattern in [`apps/api/test/core-auth.e2e-spec.ts`](../../../apps/api/test/core-auth.e2e-spec.ts).
- Tests `afterEach` clean up the rows they created (push IDs onto a per-suite array; delete in `afterEach` or `afterAll`).
- Avoid `--runInBand`. Avoid hard sleeps. Use `jest.useFakeTimers()` if you need to advance time.

## Documentation

Every module ships with:

- **Module-level doc comment** at the top of `*.module.ts` describing what the module owns and how it integrates with `AuthModule.forRoot`.
- **OpenAPI decorators** on every route (`@ApiOperation`, `@ApiBody`, `@ApiResponse` for success and known failure codes, `@ApiCookieAuth()` on protected routes if any).
- **JSDoc/TSDoc** on every public service method — purpose, args, return shape, thrown exceptions, side effects (DB writes, emails, audit rows).
- **`docs/auth/<topic>.md`** — your specified doc. Update [`docs/auth/sessions-and-audit.md`](../../auth/sessions-and-audit.md) if you introduce new audit event types.

## Final summary contract

Your last message must include an `[INTEGRATION]` section listing **every** file outside your own module folder that needs to be appended to. Example:

```
[INTEGRATION] Append these by hand after merging this branch:

1. packages/api-shared/src/v1/auth/index.ts — add:
   export * from "./email-otp.schemas";

2. apps/api/src/auth/auth.module.ts — inside forRoot(), append to imports:
   if (env.AUTH_EMAIL_OTP_ENABLED) imports.push(EmailOtpModule);
   (You'll also need to take the dynamic-config refactor of forRoot — PR 6.)

3. apps/api/src/audit/audit.types.ts — append:
   EMAIL_OTP_REQUESTED: "EMAIL_OTP_REQUESTED",

4. CHANGELOG.md — under "Unreleased":
   ### Added — PR 8 (Email OTP module) ...
```

Be exhaustive. If you didn't touch a shared file, say so explicitly: `[INTEGRATION] No shared-file changes required.`

## Run order

```bash
pnpm install                                  # if anything new added
pnpm --filter @repo/api-shared build           # rebuild before api uses new exports
pnpm --filter api check-types                  # must pass clean
pnpm --filter api test                         # unit tests
pnpm --filter api test:e2e                     # e2e (needs Postgres on :5434 running)
pnpm gen                                       # regenerates openapi.json + packages/api-generated
```

Commit at the end of your run with a message starting with `feat(auth/<method>): ...`.
