# Auth System — Actualized Plan

> Supersedes `~/.claude/plans/let-s-start-with-the-enumerated-lemur.md`. This file is the source of truth for the auth-API rollout going forward.

## Scope (this milestone)

**API only.** No web or mobile client code. Every auth method ships behind an env toggle. Locked tech: NestJS 11, Prisma 7, Postgres 16, REST + OpenAPI + Orval (no tRPC), `nestjs-zod` for request validation and OpenAPI schema generation, `@repo/api-shared` (versioned `v1.*` namespace) as the single source of truth for schemas and types.

## What's shipped

| PR  | Scope                                                                                                                                      | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | Plumbing — `docker-compose.yml`, env zod schema, `pnpm gen:env`, `main.ts`, exception filter, request-ID, `/healthz`, CI, lefthook, ADR-01 | ✅     |
| 2   | `@repo/api-shared` + `packages/api-generated` skeleton                                                                                     | ✅     |
| 3   | Prisma + auth models migration + seed                                                                                                      | ✅     |
| 4   | `PrismaModule` + `UsersModule` + `MailerModule` (Log+Spy) + `SmsModule` (Log+Spy) + `AuditModule`                                          | ✅     |
| 5   | Core auth: JWT strategy + guards + decorators + throttler + `CoreAuthService` + `CoreAuthController` + 39 e2e + 22 unit tests + ADR-02/03  | ✅     |
| —   | **Scope strip** — credentials (email+password) and Facebook OAuth dropped from v1                                                          | ✅     |
| —   | **Architecture update** — `nestjs-zod` adopted, `@repo/api-shared` reshaped into `v1.*` namespace, schemas-as-source-of-truth              | ✅     |

## Architecture (current)

### `@repo/api-shared` — versioned namespace

Single import per consumer:

```ts
import { v1 } from "@repo/api-shared";

v1.auth.refreshTokensSchema; // zod schema for /v1/auth/refresh body
v1.auth.ROUTES.emailOtp.request; // "/v1/auth/email-otp/request"
v1.auth.ACCESS_TOKEN_COOKIE; // "access_token"
v1.auth.SessionUser; // type
v1.common.emailSchema; // shared zod fragment
v1.common.otpCodeSchema; // shared zod fragment
v1.common.phoneSchema;
```

Source layout:

```
packages/api-shared/src/
├── index.ts                          # exports * as v1 from "./v1"
└── v1/
    ├── index.ts                      # exports * as auth + * as common
    ├── auth/
    │   ├── index.ts                  # barrel
    │   ├── auth.constants.ts         # cookies + ROUTES
    │   ├── auth.types.ts             # SessionUser, SessionSummary, TokenPair, EnabledAuthMethods
    │   └── auth.schemas.ts           # refreshTokensSchema (more added per-method by PR 8+)
    └── common/
        ├── index.ts
        └── common.schemas.ts         # emailSchema, phoneSchema, otpCodeSchema
```

Per-method schemas added in PR 8+ MAY live in dedicated files (`email-otp.schemas.ts`, `google.schemas.ts`, etc.) re-exported from `auth/index.ts`. Adding new files is preferred over piling into `auth.schemas.ts` to keep merges clean across parallel work.

### DTOs via `nestjs-zod`

Every `@Body() dto: SomeDto` parameter uses a class derived from a `v1.*` zod schema:

```ts
// apps/api/src/auth/modules/<method>/dto/<endpoint>.dto.ts
import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class EmailOtpRequestDto extends createZodDto(
  v1.auth.emailOtpRequestInputSchema,
) {}
```

The global `ZodValidationPipe` (registered via `APP_PIPE` in `app.module.ts`) runs the schema against the incoming body. Schemas use `.strict()` to reject unknown keys (replaces the legacy `forbidNonWhitelisted: true`).

Response payloads MAY be wrapped with `@ZodSerializerDto(...)` / `@ZodResponse({ type })` when stripping is needed — the `ZodSerializerInterceptor` is registered globally and is a no-op without the decorator.

OpenAPI schema names come from `.meta({ id: "..." })` on the zod schemas. The `cleanupOpenApiDoc` helper in `main.ts` strips internal markers before emitting the JSON.

### Refresh rotation (core)

`CoreAuthService.rotateTokens` uses Postgres `SELECT … FOR UPDATE` to serialize same-jti rotations across pods, walks the `previousJti` chain forward within a 10-second grace window, and burns the session (in a separate transaction so the throw doesn't roll the burn back) on reuse-after-grace. Full algorithm in [`docs/auth/refresh-rotation.md`](../auth/refresh-rotation.md) and [ADR-03](../adr/0003-multi-instance-refresh-rotation.md).

### CoreAuthService integration point

Every auth-method module ends its happy path by calling:

```ts
const {
  accessToken,
  refreshToken,
  accessTokenExpiresInSec,
  refreshTokenExpiresInSec,
  sessionId,
} = await this.coreAuth.issueSession({
  user: { id, email },
  userAgent: req.header("user-agent") ?? null,
  ip: requestIp(req),
});
```

Then the controller drops the pair into cookies via `setAuthCookies(res, env, …)`. The pattern is verbatim what [`core-auth.controller.ts`](../../apps/api/src/auth/modules/core-auth/core-auth.controller.ts) already does in its private helpers — copy that shape exactly.

### Hashing

Pure helpers in [`apps/api/src/auth/utils/hash.ts`](../../apps/api/src/auth/utils/hash.ts):

- `hashRefreshToken(token, env.REFRESH_TOKEN_HMAC_SECRET)` — SHA-256 HMAC
- `hashOtp(code, env.OTP_HMAC_SECRET)` — same algorithm, distinct secret
- `safeEqualHex(a, b)` — constant-time comparison on hex strings

No bcrypt anywhere — credentials are out of scope.

### Audit

`AuditService.record({ type, userId, ip, userAgent, meta })` is fire-and-forget (failures logged, never thrown). New event types added to [`audit.types.ts`](../../apps/api/src/audit/audit.types.ts) as the closed vocabulary grows. Current set: `SIGNUP`, `EMAIL_VERIFIED`, `LOGIN_SUCCESS`, `LOGIN_FAIL`, `OAUTH_LINKED`, `OAUTH_UNLINKED`, `SESSION_REVOKED`, `SESSION_BURNED`, `LOGOUT_ALL`, `ACCOUNT_DELETED`, `NEW_DEVICE_NOTIFIED`.

### Throttler

Four named buckets registered in [`auth/throttler.config.ts`](../../apps/api/src/auth/throttler.config.ts): `otp-ip`, `otp-target`, `otp-target-daily`, `login-ip`. Apply via `@Throttle({ "otp-ip": { limit: …, ttl: … } })` on the relevant controllers. Defaults read from env.

### OTP code generation

Convention to be implemented per-module (or extracted to a shared util once two modules need it): in non-prod (`NODE_ENV !== "production"`) the OTP is literally `"000000"`. In prod, `OTP_LENGTH` (default 6) crypto-random digits. Hash via `hashOtp(code, env.OTP_HMAC_SECRET)` before persisting.

## Remaining PRs

Renumbered for clarity. Original numbers preserved in parentheses.

| #           | Title                                                     | Parallel-safe?       | Depends on                 |
| ----------- | --------------------------------------------------------- | -------------------- | -------------------------- |
| 6           | `AuthModule.forRoot(config)` + cleanup cron               | No (touches forRoot) | All method modules (\*)    |
| 7           | Resend + SMTP `MailerService` impls + ADR-05              | Yes                  | —                          |
| 8 (was 8)   | Email OTP module                                          | **Yes**              | —                          |
| 9 (was 10)  | Google OAuth module (+ ProviderVerificationModule + fake) | **Yes**              | —                          |
| 10 (was 12) | Apple OAuth module (jose JWKS)                            | **Yes**              | —                          |
| 11 (was 13) | SMS OTP module + SMSO.ro adapter                          | **Yes**              | —                          |
| 12 (was 14) | New-device email + audit-derived signal                   | No                   | At least one method module |

(\*) PR 6's `forRoot(config)` conditional wiring can be partially scaffolded first; the per-method `if (env.AUTH_X_ENABLED) imports.push(XModule)` lines are added as each method PR merges. The cleanup-cron half is fully independent.

## Parallel-agent rollout

PRs 8, 9, 10, 11 are designed to run in parallel. See [`./parallel-agents/_shared-context.md`](./parallel-agents/_shared-context.md) for the contract every agent must follow, and the four agent-specific prompts:

- [`./parallel-agents/email-otp.md`](./parallel-agents/email-otp.md)
- [`./parallel-agents/google-oauth.md`](./parallel-agents/google-oauth.md)
- [`./parallel-agents/apple-oauth.md`](./parallel-agents/apple-oauth.md)
- [`./parallel-agents/sms-otp.md`](./parallel-agents/sms-otp.md)

Each agent runs in its own git worktree (the Agent tool's `isolation: "worktree"` mode), produces a branch, and surfaces an `[INTEGRATION]` section in its final summary listing the lines that need to be appended to:

- `apps/api/src/auth/auth.module.ts` (the conditional `imports.push(...)` in `forRoot()`)
- `packages/api-shared/src/v1/auth/index.ts` (re-export new schemas file)
- `apps/api/src/audit/audit.types.ts` (any new event types)

After all four agents finish, integrate sequentially (merge worktrees in any order; `forRoot()` conflicts are 1-line and trivial).

## Test matrix (remaining)

Covered by the four parallel agents:

| #   | Scenario                                                           | Owner agent          |
| --- | ------------------------------------------------------------------ | -------------------- |
| 1   | Email OTP request/verify happy path (non-prod: code is `"000000"`) | email-otp            |
| 2   | Email OTP 5 wrong attempts → 401, attemptsLeft=0                   | email-otp            |
| 3   | Email OTP expired (clock advance past TTL) → 401                   | email-otp            |
| 4   | SMS OTP request/verify happy path                                  | sms-otp              |
| 5   | Google sign-in new user (verified email) → tokens + AuthAccount    | google               |
| 6   | Google sign-in existing email NOT verified by Google → 409         | google               |
| 7   | Apple first-login email captured, second-login uses stored email   | apple                |
| 8   | Apple `@privaterelay.appleid.com` accepted                         | apple                |
| 9   | Throttler: 21st OTP from same IP → 429                             | email-otp or sms-otp |

Covered by PR 6:

- Cron cleanup deletes expired rows (manual `.runOnce()`)
- `GET /v1/auth/enabled-methods` reflects env flags (refresh from PR 5 state)

## Out of scope (post-v1 backlog)

Redis throttler storage · 2FA / TOTP · email/phone change · concurrent session cap · IP truncation (GDPR) · `pnpm gen` drift check in CI · JWT `kid` rotation · web client implementation · mobile client implementation.
