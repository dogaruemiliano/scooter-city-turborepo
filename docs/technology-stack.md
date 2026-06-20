# Technology Stack

Internal reference for the template's main technologies and how the pieces fit
together. The short version: this is a TypeScript monorepo with a NestJS API,
Next.js web app, Expo mobile shell, PostgreSQL database, shared Zod contracts,
and shared design tokens.

## Monorepo Foundation

- pnpm 11 workspaces manage `apps/*` and `packages/*`.
- Turborepo 2 coordinates `build`, `dev`, `lint`, `check-types`, `test`, and
  `test:e2e` tasks.
- TypeScript is the default language across apps and packages.
- ESLint 9 flat config, Prettier, Lefthook, and lint-staged provide local
  quality gates.
- GitHub Actions runs install, lint, typecheck, tests, migrations, seed, and
  API E2E tests against PostgreSQL.

## API

`apps/api` is a NestJS 11 REST API with module boundaries around auth, users,
audit, mail, SMS, health, config, and Prisma.

Important libraries:

- `@nestjs/swagger` publishes Swagger UI and OpenAPI JSON.
- `nestjs-zod` connects shared Zod schemas to NestJS validation and response
  serialization.
- `@nestjs/throttler` protects auth and OTP routes from burst traffic.
- `@nestjs/terminus` powers `/healthz`.
- `nestjs-pino` provides structured request logging.
- `jose` signs/verifies JWTs and publishes JWKS.
- `nodemailer` sends SMTP email.
- `google-auth-library` verifies Google ID tokens.

The API exposes complete runtime docs at `/api-docs` and `/api-docs-json`.
The root `openapi.json` is the checked-in contract snapshot.

## Authentication

Authentication is custom-rolled and API-owned.

Implemented API capabilities:

- Email OTP sign-up and sign-in.
- Google ID-token exchange.
- Apple ID-token exchange.
- OAuth email verification when a provider email claim is not trusted.
- HttpOnly cookie sessions for the web app.
- Bearer-token-compatible response bodies for future native clients.
- RS256 access/refresh JWTs and JWKS publication.
- Refresh-token rotation with replay detection and multi-instance safety.
- Active sessions, logout, logout-all, linked account unlinking, and account
  deletion.
- Append-only audit events.

Do not add NextAuth, Auth.js, Lucia, or another auth framework. The detailed
auth docs live in [auth/README.md](auth/README.md).

## Database And Prisma

The local and CI database is PostgreSQL 16. Local Docker maps it to
`localhost:5434`.

The API uses Prisma 7 with the project-specific setup:

- `generator client` uses `provider = "prisma-client"`.
- Client output is `apps/api/src/generated/prisma`.
- `datasource.url` lives in `apps/api/prisma.config.ts`.
- Runtime client construction uses `@prisma/adapter-pg`.
- Pool settings are explicit in `apps/api/src/prisma/prisma.service.ts`.

Main models:

- `User`
- `Session`
- `RefreshToken`
- `OtpChallenge`
- `OtpDeliveryQuota`
- `AuthAccount`
- `AuditEvent`

Read the Prisma rule in [../AGENTS.md](../AGENTS.md) before touching schema,
migrations, client generation, or runtime Prisma code.

## Shared API Contracts

`packages/api-shared` is the contract source of truth for app/API boundaries.
It contains:

- Zod request and response schemas.
- Inferred TypeScript types.
- Route constants.
- Cookie names.
- Shared validation primitives.
- Runtime-neutral `apiFetch`.
- `AuthAdapter` integration point for runtime-specific refresh behavior.

The normal flow is:

1. Add or update schemas in `packages/api-shared/src/v1`.
2. Export them through the domain barrel.
3. Use them in NestJS DTO wrappers/controllers.
4. Consume the same schemas and types from web/mobile code.
5. Regenerate `openapi.json` when the HTTP contract changes.

## Web App

`apps/web` is a Next.js 16 App Router app with React 19.

Key pieces:

- Locale-aware routing through `next-intl`.
- Server Components use `meOnServer()` for fast JWKS-based session checks.
- DB-fresh pages use `meFromApi()`.
- Client Components use `SessionProvider` and `webApi.fetch`.
- Shared UI comes from `@repo/ui`.
- Theme CSS comes from `@repo/theme`.
- `/shadcn` acts as an internal UI reference page.

The web app sends requests directly to the NestJS API. It is not a backend for
frontend that reissues tokens.

## Mobile App

`apps/mobile` is an Expo SDK 55 shell with React Native 0.83.

Current capabilities:

- `expo-router` file-based routing.
- Drawer navigation.
- Shared localization helpers.
- `@repo/theme-native` and Unistyles setup.
- `@repo/ui-native` shared components.

Mobile auth and API token storage are not implemented yet. See
[missing-work.md](missing-work.md).

## Design System

The design-token source of truth is `packages/theme/src/tokens/`.

Token categories:

- Color primitives and semantic color roles.
- Spacing.
- Radius.
- Typography.
- Shadow.
- Motion.
- Z-index.
- Breakpoints.

`@repo/theme` exports TypeScript tokens, generated CSS variables, runtime/native
tokens, and Tailwind integration. `@repo/theme-native` bridges the same design
system into React Native Unistyles. `@repo/ui` and `@repo/ui-native` consume
those tokens.

Do not hard-code visual or motion values in app/component code when a token
exists. Add the token first, then consume it.

## Internationalization

`packages/i18n` owns shared locale definitions, message catalogs, and
dependency-free formatting helpers. The API, web app, and mobile app all use the
same locale contract so request handling and UI strings stay aligned.

## Testing

- API unit tests use Jest.
- API E2E tests use Jest and Supertest.
- Web tests use Vitest and Testing Library.
- Shared packages use TypeScript checks and focused runtime tests.
- CI runs lint, typecheck, unit tests, migrations, seed, and E2E tests.

## Operational Baseline

Available now:

- `/healthz` readiness checks.
- Structured request logging with request IDs.
- OpenAPI snapshot generation.
- Config validation on startup.
- Mail and SMS transport abstractions.
- Auth cleanup job for expired/stale rows.

Still needed for production deployments:

- Deployment runbooks.
- Backups and restore drills.
- Secret/key rotation procedure.
- Metrics, tracing, alerting, and log retention.
- Edge/DDoS protection and trusted-proxy policy.
