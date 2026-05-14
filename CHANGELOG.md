# Changelog

All notable changes land here. Each PR appends an entry under `Unreleased`; releases promote it under a new dated heading.

## Unreleased

### Added — PR 7 (Resend + SMTP mailer impls + ADR-0005)

- **`ResendMailerService`** ([`apps/api/src/mailer/impls/resend-mailer.service.ts`](apps/api/src/mailer/impls/resend-mailer.service.ts)) — production mailer over the Resend HTTP API. Constructor validates `RESEND_API_KEY` (defense in depth on top of the env schema's cross-field rule). Surfaces Resend's error envelope as a thrown `Error`. No retry loop — Resend owns its own queuing.
- **`SmtpMailerService`** ([`apps/api/src/mailer/impls/smtp-mailer.service.ts`](apps/api/src/mailer/impls/smtp-mailer.service.ts)) — production mailer over SMTP via `nodemailer`. Auto-picks STARTTLS-on-587 vs implicit-TLS-on-465 based on `SMTP_PORT`. Implements `OnModuleDestroy` to close the transporter on shutdown.
- **`MailerModule.forRoot(env)`** — `DynamicModule` factory that registers **only** the impl selected by `env.MAILER_PROVIDER`. The previous design (pre-register every impl, switch in a factory) would have fired the unselected impls' constructors and tripped their env validators. The factory pattern keeps unused impls out of the graph entirely. The abstract `MailerService` token still binds via `useExisting` so E2E tests can swap in `SpyMailerService` with `overrideProvider(MailerService).useClass(SpyMailerService)`.
- **Unit tests** for both new impls mock the underlying SDKs (`resend`, `nodemailer`) so they run without network: [`resend-mailer.service.spec.ts`](apps/api/src/mailer/impls/resend-mailer.service.spec.ts), [`smtp-mailer.service.spec.ts`](apps/api/src/mailer/impls/smtp-mailer.service.spec.ts).
- **`resend`** and **`nodemailer`** added as runtime deps; **`@types/nodemailer`** as a dev dep.
- **[ADR-0005](docs/adr/0005-pluggable-mailer-sms.md)** — pluggable mailer + SMS interface-and-adapter pattern: why `forRoot(env)` over factory-with-conditional-providers, why per-impl constructor validation, why each impl owns its own provider switch arm. Sets the pattern PR 11 (SMSO.ro SMS adapter) will follow.

### Added — PR 10 (Sign in with Apple)

- **`POST /v1/auth/apple`** — accepts an Apple-issued identity token (web Sign in with Apple JS or the native SDK), verifies it against Apple's rotating JWKS (`https://appleid.apple.com/auth/keys`) with audience pinned to `APPLE_SERVICE_ID | APPLE_BUNDLE_ID`, resolves the user via the four linking cases documented in [`docs/auth/oauth-linking-rules.md`](docs/auth/oauth-linking-rules.md), mints a first-party session via `CoreAuthService.issueSession`, sets `access_token` + `refresh_token` cookies, and returns a `TokenPair`. Public + `login-ip`-throttled.
- **`AppleVerifier` abstract + `RealAppleVerifier`** — wraps `jose`'s `createRemoteJWKSet` (JWKS caching + key rotation handled transparently) and `jwtVerify` (signature + issuer + audience + `±5s` clock-skew). `FakeAppleVerifier` ships with the test suite for `Test.createTestingModule().overrideProvider(AppleVerifier).useClass(FakeAppleVerifier)`-style injection.
- **`AppleAuthModule`** conditionally registered by `AuthModule.forRoot(buildAuthConfig(env))` when `config.apple.enabled === true`. When the flag is off, the route returns 404, no JWKS fetch ever happens, and no `APPLE_*` env is required.
- **Apple-specific behavior baked into `AppleAuthService`:**
  - Email captured into `AuthAccount.email` on the very first sign-in (Apple omits it on every subsequent sign-in for the same `sub`); never overwritten thereafter.
  - `@privaterelay.appleid.com` addresses accepted with no domain block.
  - `email_verified` / `is_private_email` claims coerced from either string or boolean.
  - Subsequent sign-in arriving without a known `AuthAccount` row → 401 with a generic message + `LOGIN_FAIL { reason: "missing-email-on-resign" }` (data-loss edge case).
- **`v1.auth.appleSigninSchema`** in `@repo/api-shared` — `.strict()` body validator with `meta({ id: "AppleSignin" })` so Orval emits `AppleSignin` in `openapi.json`. Optional nested `fullName` payload (first-login hint) is also schema'd as `AppleFullName`.
- **E2E coverage** in `apps/api/test/apple-auth.e2e-spec.ts` exercising: new-user first sign-in, return sign-in without `email`, private-relay accepted, auto-link onto same-email verified user, 409 unverified-email branch, verifier-rejected 401, cookie writes, and schema-strictness 400.
- **Dependency added:** `jose@^6` in `apps/api` (signature verification + JWKS fetching).
- **Docs** — new [`docs/auth/apple-signin.md`](docs/auth/apple-signin.md) with the full quirk list (JWKS rotation, audience config, per-app `sub`, first-login email rule, private relay, `fullName` hint). The Apple section of [`docs/auth/oauth-linking-rules.md`](docs/auth/oauth-linking-rules.md) is fleshed out (was a placeholder under PR 9).

### Added — PR 8 (Email OTP module)

- **`EmailOtpModule`** at [`apps/api/src/auth/modules/email-otp/`](apps/api/src/auth/modules/email-otp/). Two public endpoints:
  - `POST /v1/auth/email-otp/request` — body `{ email }`; returns `202 { status: "sent" }` unconditionally. Inserts an `OtpToken` row + sends the code via `MailerService` when the email matches a real user; otherwise burns matched-latency work via `coreAuth.performDummyHashCompare()` so the response time doesn't disclose existence.
  - `POST /v1/auth/email-otp/verify` — body `{ email, code }`; on match marks the row used, sets `User.emailVerified` (first time only), emits `EMAIL_VERIFIED` + `SIGNUP` (first sign-in only) + `LOGIN_SUCCESS` audits, calls `coreAuth.issueSession`, writes cookies, returns a `TokenPair`. Wrong-code attempts bump `attemptsCount`; at `OTP_MAX_ATTEMPTS` the row is locked and further verifies are refused without re-checking. Every failure path returns the generic `401 "Invalid or expired code"` body.
- **Shared schemas** in [`packages/api-shared/src/v1/auth/email-otp.schemas.ts`](packages/api-shared/src/v1/auth/email-otp.schemas.ts): `emailOtpRequestSchema`, `emailOtpVerifySchema` — both `.strict()` and consumed by NestJS DTOs via `createZodDto`.
- **Shared OTP-code helper** at [`apps/api/src/auth/utils/otp-code.ts`](apps/api/src/auth/utils/otp-code.ts) — `generateOtpCode({ nodeEnv, length })`. Returns `"000000"` in non-production; rejection-sampled crypto-random digits in production. Will be reused by the SMS-OTP module (PR 11) without reimplementation.
- **Module wired into `AuthModule.forRoot()`** behind `config.emailOtp.enabled` (drives off `env.AUTH_EMAIL_OTP_ENABLED`, default `true`).
- **E2E coverage** at [`apps/api/test/email-otp.e2e-spec.ts`](apps/api/test/email-otp.e2e-spec.ts): request happy paths (known + unknown email), verify happy path (cookies, session, audits), 5-wrong-attempts lockout, expired-row 401, anti-enumeration timing sanity, throttler 21st-call 429.
- **Docs:** [`docs/auth/otp.md`](docs/auth/otp.md) — code generation (the `"000000"` dev bypass, why `NODE_ENV`-derived), hashing, attempts counter, expiry, anti-enumeration, throttler buckets, audit emissions.

**Known gap (carried forward):** `otp-target` / `otp-target-daily` throttler buckets currently fall back to IP keying — the request-body tracker keyed on `body.email` has not shipped. Under a single IP these buckets behave like extra per-IP limits, not per-target limits. Tracked in [`docs/auth/rate-limiting.md`](docs/auth/rate-limiting.md).

### Added — PR 6 (`AuthModule.forRoot(config)` + cleanup cron)

- **`AuthModule.forRoot(config: AuthModuleConfig)`** now accepts a typed config — disabled features contribute nothing to the graph. The config is built from env by `buildAuthConfig(env)` in [`apps/api/src/auth/auth.config.ts`](apps/api/src/auth/auth.config.ts). The factory itself stays free of `env.AUTH_X_ENABLED` lookups so tests can hand-craft configs (force-enable a single method, disable the cron) without going through `process.env`.
- **`AuthCleanupService`** ([`apps/api/src/auth/cleanup/auth-cleanup.service.ts`](apps/api/src/auth/cleanup/auth-cleanup.service.ts)) runs daily at 03:00 server-local via `@nestjs/schedule`'s `EVERY_DAY_AT_3AM` cron. Three deletes in one transaction: `RefreshToken WHERE expiresAt < now`, `OtpToken WHERE expiresAt < now - 7d`, `Session WHERE revokedAt < now - 30d`. `AuditEvent` rows are never touched here — audit history is append-only. The cron entry-point and the test-friendly `runOnce()` share one body.
- **`AUTH_CLEANUP_ENABLED`** env flag (default `true`) gates registration of both `ScheduleModule` and the service. When off, no cron is installed, no scheduler runs.
- **`@nestjs/schedule`** added as a runtime dep.
- **E2E coverage** in [`apps/api/test/auth-cleanup.e2e-spec.ts`](apps/api/test/auth-cleanup.e2e-spec.ts): seeds an old + a fresh row per table, calls `runOnce()`, asserts the old row is gone and the fresh one survives. Includes an idempotency check (second pass deletes nothing).

### Added — PR 9 (Google OAuth)

- **`POST /v1/auth/google`** — accepts a Google-issued ID token, verifies it against the configured `GOOGLE_CLIENT_ID_WEB | _IOS | _ANDROID` audiences, resolves the user via the four linking cases documented in [`docs/auth/oauth-linking-rules.md`](docs/auth/oauth-linking-rules.md), mints a first-party session via `CoreAuthService.issueSession`, sets `access_token` + `refresh_token` cookies, and returns a `TokenPair`. Public + `login-ip`-throttled.
- **`GoogleVerifier` abstraction** — abstract class declared in `apps/api/src/auth/modules/google/google-verifier.interface.ts`, bound to the production `RealGoogleVerifier` (wraps `google-auth-library`'s `OAuth2Client.verifyIdToken`) inside `GoogleAuthModule`. `FakeGoogleVerifier` lives in the same directory and is swapped in via `Test.createTestingModule().overrideProvider(GoogleVerifier).useClass(FakeGoogleVerifier)`.
- **`GoogleAuthModule`** conditionally registered by `AuthModule.forRoot(buildAuthConfig(env))` when `config.google.enabled === true`. When the flag is off, the route returns 404, no Google client is constructed, and no `GOOGLE_CLIENT_ID_*` env is required.
- **`v1.auth.googleSigninSchema`** in `@repo/api-shared` — `.strict()` body validator with `meta({ id: "GoogleSignin" })` so Orval emits `GoogleSignin` in `openapi.json`.
- **E2E coverage** in `apps/api/test/google-auth.e2e-spec.ts` exercising all four linking cases, the 409 unverified-email branch, the verifier-rejected 401 path, cookie writes, and schema-strictness 400s.
- **Docs** — new [`docs/auth/oauth-linking-rules.md`](docs/auth/oauth-linking-rules.md) covering the four linking cases, unlink semantics, and per-provider quirks (Google's `email_verified`, Apple's email-on-first-login).

### Removed — scope strip (credentials + Facebook out of v1)

- **`User.passwordHash`** column removed from the Prisma schema (init migration edited; reset the local dev DB to re-apply).
- **`passwordSchema`** removed from `@repo/api-shared`.
- **`AUTH_CREDENTIALS_ENABLED`, `AUTH_FACEBOOK_ENABLED`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`** env vars removed (and their `superRefine` cross-field rules).
- **`credentials` and `facebook` fields** removed from `EnabledAuthMethods`, the OpenAPI response, and the controller payload.
- **`SIGNUP_ATTEMPT_EXISTING_EMAIL`, `EMAIL_VERIFY_SENT`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_CONFIRMED`** removed from `AuditEventType`. (`EMAIL_VERIFIED` kept — emitted by email-OTP first verify.)
- **OAuth provider set** in `unlinkOAuthAccount` narrowed to `"google" | "apple"`.
- **`ROUTES.credentials.*` and `ROUTES.facebook`** removed from `@repo/api-shared`.
- **Seed** narrowed to 4 fixture users (`seed-user-email-otp`, `-sms`, `-google`, `-apple`); bcrypt dependency unused at the seed boundary.
- **Docs** synced (`docs/auth/sessions-and-audit.md`, `README.md`, `packages/api-shared/README.md`).

### Added — PR 5 part 2 (`CoreAuthController` + AuthModule + Orval pipeline + docs)

- **`CoreAuthController`** under `/v1/auth/...` with eight endpoints:
  - `POST /refresh` (public; cookie or JSON-body refresh token), `POST /logout`, `POST /logout-all`, `GET /me`, `DELETE /me`, `GET /sessions`, `DELETE /sessions/:id`, `DELETE /accounts/:provider` (refuses if the unlink would leave the user with no remaining auth method), `GET /enabled-methods` (public).
  - Every state-changing call emits an `AuditEvent` row.
  - DTOs decorated with `@ApiProperty` so Orval emits schema names that mirror the `@repo/api-shared` types (`SessionUser`, `SessionSummary`, `TokenPair`, `EnabledAuthMethods`).
- **`AuthModule.forRoot()` DynamicModule** wiring `PassportModule` + `JwtModule` + `ThrottlerModule` + `CoreAuthModule`. PR 8+ will append conditional auth-method modules (`EmailOtpModule`, `CredentialsModule`, OAuth modules, `SmsOtpModule`) based on the `AUTH_*_ENABLED` env flags.
- **Global guards** registered via `APP_GUARD`: `JwtAuthGuard` (honors `@Public()`) and `ThrottlerGuard`. `/healthz` is marked `@Public()` so orchestrators don't need credentials.
- **First Orval generation** — `packages/api-generated` now contains an auto-generated 461-line `src/index.ts` derived from the OpenAPI spec, plus a hand-written `src/mutator.ts` that wraps `fetch` with `credentials: "include"` and normalizes the AllExceptionsFilter error envelope. The `pnpm gen` pipeline now runs: refresh `.env.example` → build `@repo/api-shared` → build `apps/api` → emit OpenAPI JSON → run Orval.
- **`@repo/api-shared` is now a build-emitting package** (`tsc -p tsconfig.build.json` → `dist/`) so compiled API can load it from Node. Test consumers still hit source via Jest's `moduleNameMapper`.
- **Docs:**
  - [`docs/auth/refresh-rotation.md`](docs/auth/refresh-rotation.md) — full algorithm walkthrough (FOR UPDATE, chain walk, grace window, burn semantics, why-not-Serializable).
  - [`docs/auth/cookies.md`](docs/auth/cookies.md) — flags, eTLD+1 constraint, CSRF stance.
  - [`docs/auth/rate-limiting.md`](docs/auth/rate-limiting.md) — four named buckets, custom tracker plans, in-memory storage caveat.
  - [`docs/adr/0002-cookie-based-sessions.md`](docs/adr/0002-cookie-based-sessions.md) — why no `next-auth`/Lucia/better-auth.
  - [`docs/adr/0003-multi-instance-refresh-rotation.md`](docs/adr/0003-multi-instance-refresh-rotation.md) — why DB-side chain instead of in-memory cache.

### Added — PR 5 part 1 (auth foundations: utils + JWT + guards + CoreAuthService + 45 tests)

- **CoreAuthService** (~378 lines) — `issueSession`, `rotateTokens` (FOR UPDATE-locked, chain-walk grace, reuse-burn in separate transaction), `revokeSession`, `revokeAllUserSessions`, `listSessions`, `performDummyHashCompare`.
- **Token-mint utils** at `auth/utils/token-mint.ts` (~108 lines) — pure functions for `ttlStringToSeconds`, `mintAccessToken`, `mintRefreshToken`.
- **Cookies + hash + JWT-extractors** under `auth/utils/`. Cookie-first then Bearer fallback for browser + mobile.
- **JwtStrategy + JwtAuthGuard + `@Public()` + `@CurrentUser()`**.
- **Throttler config** with four named buckets (`otp-ip`, `otp-target`, `otp-target-daily`, `login-ip`).
- **Tests: 45 passing.** 22 unit (token-mint, spy mailer/sms, schemas + hash) + 23 e2e (rotation: 6 scenarios; timing: 3 attack-path sanity checks; healthz + api-shared + users + audit + controller endpoints). Includes a parallel-3 rotation test that exercises the chain-walk under concurrency.

### Added — PR 4 (Prisma / Users / Mailer / SMS / Audit infrastructure)

- **`PrismaModule` + `PrismaService`** — global module exposing a `PrismaClient` constructed with the `PrismaPg` driver adapter and explicit pool settings (`max: 10`, `idleTimeoutMillis: 30s`, `connectionTimeoutMillis: 5s`) per `AGENTS.md → prisma-verify-rule`. `onModuleInit → $connect`, `onModuleDestroy → $disconnect` wired into NestJS's shutdown hooks.
- **`/healthz` now pings the DB** via the built-in `@nestjs/terminus` `PrismaHealthIndicator` (`SELECT 1` with a 2s timeout). The custom indicator pattern is no longer needed; the new `HealthIndicatorService` API from terminus 11 is already used internally by the built-in indicator.
- **`UsersModule` + `UsersService`** — thin data-access wrapper exposing `findById`, `findByEmail`, `findByPhone`, `createOne`, `deleteOne`. Inputs use Prisma's generated `Prisma.UserCreateInput` (no hand-rolled DTOs at this layer — auth modules in PR 5+ own those).
- **`MailerModule`** — `MailerService` (abstract) + `LogMailerService` (default, pino-backed) + `SpyMailerService` (in-memory queue for E2E). `MAILER_PROVIDER=resend|smtp` paths fall back to `Log` until PR 7 lands the concrete impls. Tests override via `Test.createTestingModule().overrideProvider(MailerService).useClass(SpyMailerService)`.
- **`SmsModule`** — same shape as MailerModule (`SmsService` + `LogSmsService` + `SpySmsService`). `SMS_PROVIDER=smso` falls back to `Log` until PR 13.
- **`AuditModule` + `AuditService`** — global `record({ type, userId?, ip?, userAgent?, meta? })` writes one `AuditEvent` row per call. Failures are logged but never thrown — losing an audit must not break the user-facing flow that emits it. `AuditEventType` closed vocabulary at `src/audit/audit.types.ts` (16 values today; grows as features land).
- **Authorization explicitly deferred** to a future session. UsersService has no role check; controllers in PR 5+ rely on the existing `JwtAuthGuard` for authentication only. Adding CASL / Nest RolesGuard / a `role` column is a deliberate follow-up choice for downstream projects.
- **Jest + Prisma 7 plumbing:**
  - `moduleNameMapper` now strips `.js` from relative imports so ts-jest can resolve the generated client's ESM-style imports inside a CJS test env.
  - `testEnvironmentOptions.customExportConditions = ["node", "node-addons", "require", "default"]` so Jest resolves the `@prisma/client` exports map correctly.
  - `test:e2e` script now runs under `NODE_OPTIONS=--experimental-vm-modules` so the dynamic `await import()` in Prisma's WASM query-compiler loader works.
- **CI workflow** now runs `prisma migrate deploy` + `prisma db seed` before the E2E suite so the Postgres service is in a known-good state.

### Added — PR 3 (Prisma 7 + auth schema + seed)

- **Prisma 7** wired into `apps/api`:
  - `prisma.config.ts` is the single source of truth for the datasource URL (Prisma 7 removed `url = env(...)` from the schema).
  - `schema.prisma` uses the `prisma-client` generator (not the legacy `prisma-client-js`) with `engineType = "client"` and `output = "../src/generated/prisma"`. The generated client lives outside `node_modules` and is gitignored; `prisma generate` runs on `postinstall` and as part of `pnpm build` so it can never drift.
  - Runtime client connects through the **`PrismaPg` driver adapter** (mandatory in v7) with explicit pool settings (`max: 10`, `idleTimeoutMillis: 30_000`, `connectionTimeoutMillis: 5_000`) per AGENTS.md.
- **Auth schema** lands as the first migration (`init`): `User`, `Session`, `RefreshToken` (with `previousJti` + `pendingTokenHash` for the option-B grace window), `OtpToken`, `AuthAccount`, `AuditEvent`. Every PK is `String @id @default(cuid())` — the BigInt-in-JSON serialization footgun (would silently crash `AllExceptionsFilter` on a Prisma-error response) is documented in [docs/auth/sessions-and-audit.md](docs/auth/sessions-and-audit.md).
- **Idempotent seed** at `apps/api/prisma/seed.ts` with six fixture users with stable IDs (`seed-user-credentials`, `seed-user-email-otp`, …). Refuses to run when `NODE_ENV=production`. Wired via `prisma db seed` → `tsx prisma/seed.ts`.
- **Docker Compose port bumped from 5432 → 5434** to coexist with any host-installed Postgres on the default port. `DATABASE_URL` defaults and CI workflow updated to match.
- **New deps in `apps/api`:** `@prisma/client@7`, `@prisma/adapter-pg`, `pg`, `prisma@7` (dev), `@types/pg` (dev), `bcrypt`, `@types/bcrypt`, `dotenv`, `tsx` (dev).
- **`docs/auth/sessions-and-audit.md`** documents the four-table layout, why a first-class `Session` table exists, cascade behavior on user deletion, the `AuditEvent.type` vocabulary, and what the seed creates.

### Added — PR 2 (`@repo/api-shared`)

- New zero-build workspace package `packages/api-shared` exporting hand-maintained code that Orval cannot generate from the OpenAPI doc:
  - **Cookies**: `ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE`, `AuthCookieName`.
  - **Session shapes**: `SessionUser`, `SessionSummary`, `TokenPair`, `EnabledAuthMethods`.
  - **Zod fragments**: `emailSchema` (RFC 5321, accepts `@privaterelay.appleid.com`), `phoneSchema` (E.164), `otpCodeSchema` (6 digits, accepts the non-prod `"000000"` value), `passwordSchema` (`min(8)`, `max(128)`, no complexity refine).
  - **`ROUTES`** constant — every `/v1/auth/*` path that the locked plan defines, including parametrized helpers `sessions.revoke(id)` and `accounts.unlink(provider)`.
- Wired `@repo/api-shared` into `apps/api` as a workspace dependency.
- Added an API E2E smoke test (`test/api-shared.e2e-spec.ts`) proving the workspace import + transform pipeline works end-to-end. Real schema/route correctness is left to the auth-module E2E tests in PR 5+ — these fragments would otherwise just be re-testing zod.
- Jest config (`apps/api/test/jest-e2e.json`) gained `transformIgnorePatterns` + `moduleNameMapper` entries that whitelist `@repo/*` workspace packages so ts-jest transforms their raw `.ts` source.
- `orval.config.ts`: TODO note for PR 5 to add a zod-schema target alongside the fetch client. Form validation across web + mobile will then import the same zod schemas the API validates against (single source of truth: API DTOs → OpenAPI → orval → zod).

### Added — PR 1 (Plumbing)

- `docker-compose.yml` — local Postgres 16 with healthcheck.
- `apps/api`:
  - Zod-validated env schema at `src/config/env.ts` with `.describe()` on every key (single source of truth for env vars).
  - `ConfigModule` wrapping `@nestjs/config` with zod validation and an `ENV` injection token.
  - `nestjs-pino` structured logging (pretty in dev, JSON elsewhere).
  - `RequestIdMiddleware` honoring incoming `X-Request-Id` and generating UUIDs otherwise.
  - `AllExceptionsFilter` normalizing every error to `{ error: { code, message, details?, requestId? } }`.
  - `/healthz` (version-neutral) via `@nestjs/terminus` with heap-memory indicator. DB ping lands in PR 3.
  - `main.ts` bootstrap: URI versioning `/v1`, global ValidationPipe, CORS with credentials, cookie-parser, Swagger at `/api-docs` with `cookieAuth` security scheme, `--spec-only` mode for the Orval pipeline, graceful shutdown hooks.
  - `apps/api/.env.example` auto-generated by `pnpm gen:env`.
- `scripts/generate-env-example.ts` — walks the zod schema, emits `.env.example`.
- Root `pnpm gen` pipeline stub (`gen:env` → API build → `--spec-only` → orval).
- `orval.config.ts` — fetch client + zod mode targeting `packages/api-generated` (created in PR 2).
- `.github/workflows/ci.yml` — lint · typecheck · test · e2e, Postgres service.
- `lefthook.yml` + `.lintstagedrc.json` — pre-commit Prettier on staged files.
- `docs/adr/0001-rest-not-trpc.md`, `docs/adr/0004-prisma-orm.md`.
- Removed the create-turbo `AppController`/`AppService` Hello-World boilerplate.
