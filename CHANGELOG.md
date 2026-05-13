# Changelog

All notable changes land here. Each PR appends an entry under `Unreleased`; releases promote it under a new dated heading.

## Unreleased

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
