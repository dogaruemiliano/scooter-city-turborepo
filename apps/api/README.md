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
