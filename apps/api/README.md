# `api` - NestJS API

NestJS REST API for the template. The API owns authentication, database access,
OpenAPI generation, mail/SMS transports, audit events, and operational health
checks.

Routes are versioned under `/v1` except operational endpoints such as
`/healthz`, `/api-docs`, `/api-docs-json`, and `/.well-known/jwks.json`.

## Responsibilities

- Validate runtime config with Zod through `src/config/env.ts`.
- Serve Swagger/OpenAPI documentation from NestJS decorators and Zod DTOs.
- Issue and verify RS256 JWTs through the shared key-ring implementation.
- Rotate refresh tokens with the multi-instance-safe algorithm documented in
  [../../docs/auth/refresh-rotation.md](../../docs/auth/refresh-rotation.md).
- Persist users, sessions, refresh tokens, OTP challenges, OAuth accounts,
  delivery quotas, and audit events in PostgreSQL through Prisma 7.
- Send email OTP messages through SMTP and provide pluggable SMS transports.
- Enforce request throttles, CSRF protection for cookie mutations, and
  normalized error responses.

## Local Development

From the repository root:

```bash
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api dev
```

The API imports compiled workspace packages from their `dist` directories. After
adding or changing runtime exports in `@repo/api-shared`, rebuild that package
with `pnpm --filter @repo/api-shared build` and restart the API development
process. Nest's source watcher does not reload an already-cached workspace
module just because its compiled package changes. Type checking reads the
shared source types, so it can pass while the running process still has old
exports loaded.

Local PostgreSQL runs on `localhost:5434` to avoid colliding with a host
PostgreSQL instance on the default port.

For local auth development:

- Set `REFRESH_TOKEN_HMAC_SECRET` and `OTP_HMAC_SECRET` to values with 32 or more
  characters.
- Leave `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` empty in development. Dev keys are
  generated under `apps/api/.dev-keys/` and are ignored by Git.
- Configure SMTP variables if you need real email delivery. In non-production,
  OTP codes are always `000000`.

Regenerate `.env.example` after changing `src/config/env.ts`:

```bash
pnpm gen:env
```

## Useful Commands

| Command                         | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `pnpm --filter api dev`         | Run NestJS in watch mode.                                      |
| `pnpm --filter api start`       | Run NestJS without watch mode.                                 |
| `pnpm --filter api build`       | Build shared packages, generate Prisma client, compile NestJS. |
| `pnpm --filter api lint`        | Run ESLint for API source and tests.                           |
| `pnpm --filter api check-types` | Run `tsc --noEmit`.                                            |
| `pnpm --filter api test`        | Run API unit tests.                                            |
| `pnpm --filter api test:e2e`    | Run API E2E tests with Jest and Supertest.                     |
| `pnpm --filter api db:migrate`  | Run `prisma migrate dev` locally.                              |
| `pnpm --filter api db:deploy`   | Run `prisma migrate deploy` for CI/deployments.                |
| `pnpm --filter api db:seed`     | Seed local/test data.                                          |
| `pnpm --filter api db:generate` | Regenerate the Prisma client.                                  |
| `pnpm --filter api spec`        | Print OpenAPI JSON from the compiled API.                      |

### E2E environment

One-time local setup, from the repository root:

```bash
docker compose --profile test up -d postgres-test
cp apps/api/.env.test.example apps/api/.env.test
```

The test profile runs PostgreSQL 16 (matching CI) on `localhost:55434`, separately
from the development server on `localhost:5434`. Its data is temporary and is
recreated by the runner after the container restarts. Normal `docker compose up`
does not start the test profile.

Edit the ignored `apps/api/.env.test` to select dedicated test databases. Keep
application settings in `.env`; do not replace the application's `DATABASE_URL`.
The committed `.env.test.example` documents the two test settings:

- `E2E_DATABASE_URL`: reusable database for the general HTTP suites. The runner
  builds shared packages, generates the Prisma client, creates the database when
  missing, applies pending migrations, and runs the idempotent seed before Jest.
  Provisioning uses the server's `postgres` database and requires `CREATEDB`;
  existing general test databases are reused without resetting them.
- `E2E_FINANCE_DATABASE_URL`: connection template for the finance-book setup
  suite. Its database name must start with `finance_books_test`. Each invocation
  creates a new database with a random suffix, migrates it without seeding, and
  removes only that generated database in cleanup. The configured template
  database is never modified and need not exist. This suite requires empty tables
  and leaves data behind, so reusing its database would break subsequent runs.

Both database names must contain a separate `test` segment. The runner refuses
production mode, identical test targets, and targets matching `DATABASE_URL` in
the shell or application `.env`, including different credentials for the same
database. PostgreSQL must permit database creation (the local Compose and CI
service roles do). Do not use servers holding real data for E2E tests.

Run all HTTP suites with automatic database preparation:

```bash
pnpm test:e2e
```

Run selected suites using filename regexes (advanced Jest flags are not accepted
by the runner):

```bash
pnpm --filter api test:e2e persons
pnpm --filter api test:e2e finance-books
```

Shell/CI variables take precedence over `.env.test`. The runner maps the selected
test URL to `DATABASE_URL` for each child process, and always uses `NODE_ENV=test`.
Turbo forwards both `E2E_*` variables. CI supplies them directly and invokes the
same runner; no local `.env.test` or separate CI migration/seed step is needed.
The finance suite runs even if general tests fail, and any test/preparation
failure makes the command fail. No-match filters also fail instead of passing
silently. Separate opt-in historical migration rehearsals still require their
own `FIXED_ROLES_MIGRATION_DATABASE_URL` / `LEGACY_ACCESS_MIGRATION_DATABASE_URL`
and specially prepared historical schemas; normal E2E runs skip them.

Use separate general databases for concurrent runs. An ungraceful termination
(for example `kill -9`) can leave a generated finance database behind; names
start with `finance_books_test_` and end with the run's random suffix.

Do not use destructive Prisma reset commands unless a human explicitly decides
that data loss is acceptable.

## Main Runtime Endpoints

| Endpoint                          | Purpose                                               |
| --------------------------------- | ----------------------------------------------------- |
| `GET /healthz`                    | Liveness/readiness check with DB and heap indicators. |
| `GET /api-docs`                   | Swagger UI.                                           |
| `GET /api-docs-json`              | Raw OpenAPI document.                                 |
| `GET /.well-known/jwks.json`      | Public signing keys for local JWT verification.       |
| `GET /v1/auth/enabled-methods`    | Server-enabled auth method list.                      |
| `POST /v1/auth/email-otp/request` | Request an email OTP challenge.                       |
| `POST /v1/auth/email-otp/verify`  | Verify an email OTP code.                             |
| `POST /v1/auth/google`            | Exchange a Google ID token for an API session.        |
| `POST /v1/auth/apple`             | Exchange an Apple ID token for an API session.        |
| `POST /v1/auth/refresh`           | Rotate refresh token and issue a new access token.    |
| `GET /v1/auth/me`                 | Return the current DB-backed user.                    |
| `POST /v1/auth/logout`            | Revoke current session.                               |
| `POST /v1/auth/logout-all`        | Revoke all user sessions.                             |
| `GET /v1/auth/sessions`           | List active sessions.                                 |

Use the generated `openapi.json` and `/api-docs` as the complete HTTP
reference. The auth architecture is documented in
[../../docs/auth/README.md](../../docs/auth/README.md).

## Prisma 7 Notes

This project intentionally uses Prisma 7's driver-adapter architecture:

- Generator provider is `prisma-client`.
- Generated client output is `src/generated/prisma`.
- `datasource.url` lives in `prisma.config.ts`.
- Runtime `PrismaClient` is created with `@prisma/adapter-pg`.
- Pool settings are explicit in `src/prisma/prisma.service.ts`.

Before changing schema, generated client setup, migration commands, or Prisma
runtime code, read the Prisma rule in [../../AGENTS.md](../../AGENTS.md).

## Logging And Errors

`nestjs-pino` is the global logger. Development output is pretty-printed;
production output is structured JSON. Request logs carry `reqId`, correlated
with the `X-Request-Id` header when provided.

Every error response is normalized by `AllExceptionsFilter`:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": ["email must be an email"],
    "requestId": "8f3c..."
  }
}
```

### Local readiness examples

Run `pnpm --filter api db:seed-readiness` to create or refresh six labeled demo scooters: missing CIV, missing registration, expired insurance, expired ITP, both expired, and valid documents. The command only accepts a local development database and uses the configured private S3 storage for clearly marked demo CIV and ITP PDFs. It updates only its own `demo-readiness-*` records and preserves their fleet numbers on subsequent runs. No migration is needed: readiness is derived from live document and validity records.
