# Turborepo Full-Stack Template

Internal full-stack starter for product teams that need a typed API, web app,
mobile shell, shared UI, shared design tokens, and custom authentication from
day one.

This repository is intended for private/internal GitHub use only. It is
`UNLICENSED - internal template`; do not publish it as open source without a
separate licensing decision.

## When To Use It

Use this template when a new product should start with:

- A NestJS REST API with PostgreSQL, Prisma 7, OpenAPI, and Zod contracts.
- A Next.js web app with server-side session helpers and direct API calls.
- An Expo/React Native app shell that already shares theme and i18n packages.
- Shared web/native UI packages and one source of truth for design tokens.
- Custom authentication owned by the API, not by NextAuth, Auth.js, or Lucia.
- CI-ready lint, typecheck, unit test, E2E test, and migration workflows.

Do not use it as a bare marketing-site starter. The auth, database, and shared
contract layers are intentionally opinionated and are designed for apps that
need a real backend.

## Stack Overview

| Area             | Technology                                                            |
| ---------------- | --------------------------------------------------------------------- |
| Workspace        | pnpm 11 workspaces, Turborepo 2                                       |
| Language         | TypeScript 5.9                                                        |
| API              | NestJS 11, Express, Swagger/OpenAPI, nestjs-zod                       |
| Database         | PostgreSQL 16, Prisma 7, `@prisma/adapter-pg`                         |
| Auth             | Email OTP, Google, Apple API support, RS256/JWKS, refresh rotation    |
| Web              | Next.js 16 App Router, React 19, next-intl, Tailwind CSS 4            |
| Mobile           | Expo SDK 55, React Native 0.83, expo-router, Unistyles                |
| Shared contracts | Zod schemas and runtime-neutral `apiFetch` in `@repo/api-shared`      |
| Design system    | `@repo/theme`, `@repo/theme-native`, `@repo/ui`, `@repo/ui-native`    |
| Quality          | ESLint 9, Prettier, Lefthook, Jest, Vitest, Supertest, GitHub Actions |

Detailed stack notes live in [docs/technology-stack.md](docs/technology-stack.md).

## Workspace Layout

```text
apps/
  api/       NestJS API, Prisma schema, migrations, auth, mail/SMS, OpenAPI
  web/       Next.js web app with auth-aware routing, i18n, and shared UI
  mobile/    Expo app shell with drawer navigation, theme, and i18n

packages/
  api-shared/        Zod contracts, route constants, cookies, apiFetch
  i18n/              Shared locale contract, message catalogs, formatting
  theme/             Web/runtime design tokens and Tailwind integration
  theme-native/      Native theme bridge for React Native Unistyles
  ui/                Shared web components and Storybook
  ui-native/         Shared React Native components
  eslint-config/     Shared ESLint flat configs
  typescript-config/ Shared TypeScript configs
```

## Local Setup

Requirements:

- Node.js 24.17 or newer
- pnpm 11
- Docker

Install dependencies:

```bash
pnpm install
```

Run the local bootstrap:

```bash
pnpm init:local
```

`pnpm init:local` is for local development only. It sets the root package name
from the clone directory, updates the local Postgres container name, creates or
updates ignored local env files, generates local HMAC secrets when blank, starts
Docker Postgres, applies checked-in migrations, regenerates the Prisma client,
seeds local data, and builds shared runtime packages.

Start the workspace:

```bash
pnpm dev
```

Manual fallback:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres
pnpm --filter api db:deploy
pnpm --filter api db:generate
pnpm --filter api db:seed
pnpm --filter @repo/i18n build
pnpm --filter @repo/api-shared build
```

For `apps/api/.env`, `pnpm init:local` fills the two HMAC secrets when they are
blank:

- `REFRESH_TOKEN_HMAC_SECRET` with 32 or more characters.
- `OTP_HMAC_SECRET` with 32 or more characters.

In local development, leave `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` empty. The API
generates development keys under `apps/api/.dev-keys/` on first startup. These
keys are ignored and must not be committed.

SMTP, Google, Apple, and SMS provider credentials stay blank until you configure
real providers or a local SMTP capture service.

Default local URLs:

- Web: <http://localhost:3001>
- API: <http://localhost:3000>
- Swagger UI: <http://localhost:3000/api-docs>
- OpenAPI JSON: <http://localhost:3000/api-docs-json>
- Health: <http://localhost:3000/healthz>
- JWKS: <http://localhost:3000/.well-known/jwks.json>

Non-production OTP codes are always `000000`.

For a longer setup guide, see [docs/developer-guide.md](docs/developer-guide.md).

## Common Commands

| Command                         | Purpose                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                      | Run workspace development tasks.                                                                       |
| `pnpm build`                    | Build the workspace.                                                                                   |
| `pnpm lint`                     | Run ESLint.                                                                                            |
| `pnpm check-types`              | Run TypeScript checks.                                                                                 |
| `pnpm test`                     | Run unit tests.                                                                                        |
| `pnpm test:e2e`                 | Run API E2E tests.                                                                                     |
| `pnpm init:local`               | Configure the local project name, env files, Docker Postgres, DB, seed, and shared builds after clone. |
| `pnpm gen`                      | Regenerate env example, build shared/API packages, emit OpenAPI.                                       |
| `pnpm gen:env`                  | Regenerate `apps/api/.env.example` from env schema.                                                    |
| `pnpm gen:openapi`              | Emit root `openapi.json` from the compiled API.                                                        |
| `pnpm --filter api db:migrate`  | Apply local Prisma migrations.                                                                         |
| `pnpm --filter api db:deploy`   | Apply migrations in CI or deployment.                                                                  |
| `pnpm --filter api db:seed`     | Seed local/test data.                                                                                  |
| `pnpm --filter api db:generate` | Regenerate Prisma client output.                                                                       |
| `pnpm --filter @repo/ui dev`    | Run Storybook on port 6006.                                                                            |

## Internal Conventions

- Auth is custom-rolled. NestJS owns token issuance, refresh rotation, OAuth
  verification, OTP, cookies, and sessions. Do not add NextAuth, Auth.js,
  Lucia, or another auth framework.
- API contracts start in `@repo/api-shared`. Add Zod schemas and route constants
  there first, then wire NestJS DTO/controller usage, then consume from web or
  mobile.
- Theme tokens are the only source of visual values. Add missing colors,
  spacing, radii, typography, shadows, motion, z-indexes, or breakpoints under
  `packages/theme/src/tokens/` before using them.
- Prisma uses the project-specific Prisma 7 setup. Generated client output lives
  under `apps/api/src/generated/prisma`, `datasource.url` lives in
  `apps/api/prisma.config.ts`, and runtime access goes through the Pg driver
  adapter.
- Cookie-bearing mutations need `X-Requested-With: fetch`. The shared
  `apiFetch` helper adds it automatically.

Read [AGENTS.md](AGENTS.md) before changing auth, Prisma, or theme-token
behavior. It captures the guardrails that keep this template coherent.

## Documentation Map

- [docs/technology-stack.md](docs/technology-stack.md) - technology and package
  architecture.
- [docs/developer-guide.md](docs/developer-guide.md) - day-to-day development
  workflows.
- [docs/missing-work.md](docs/missing-work.md) - known gaps and recommended next
  work.
- [docs/auth/README.md](docs/auth/README.md) - authentication behavior,
  endpoints, and operations.
- [docs/adr/](docs/adr/) - architectural decisions.
- [packages/api-shared/README.md](packages/api-shared/README.md) - shared API
  contract workflow.
- [apps/web/src/lib/README.md](apps/web/src/lib/README.md) - web session helper
  details.

## Current Gaps

The template is intentionally strong on API, auth, shared contracts, and web
session plumbing. The main unfinished areas are:

- Mobile authentication UI and SecureStore token storage.
- Apple sign-in web UI.
- Apple server-to-server token revocation.
- Deployment runbooks, production infrastructure, backups, and secret rotation.
- Application monitoring, tracing, alerting, and audit export tooling.
- Product-specific domain modules beyond users/auth/account settings.

See [docs/missing-work.md](docs/missing-work.md) for the fuller backlog.

## GitHub Publishing Notes

- Keep the GitHub repository private/internal.
- Keep `.env`, `.dev-keys`, `.next`, `dist`, `.turbo`, `node_modules`, `Pods`,
  and `.DS_Store` untracked.
- Keep `openapi.json` tracked only as the current generated API contract
  snapshot.
- Do not add a public license unless the internal distribution decision changes.

## License

UNLICENSED - internal template.
