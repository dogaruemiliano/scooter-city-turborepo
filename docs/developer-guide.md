# Developer Guide

Day-to-day guide for internal engineers using or extending the template.

## First-Time Setup

Requirements:

- Node.js 20 or newer.
- pnpm 9.
- Docker.

Install dependencies:

```bash
pnpm install
```

Run the local bootstrap:

```bash
pnpm init:local
```

This command is for local development only. It creates missing ignored env
files, merges missing env keys without overwriting existing values, generates
local HMAC secrets when blank, starts Docker Postgres, applies checked-in
migrations, regenerates Prisma client output, seeds local data, and builds the
shared runtime packages.

Run everything:

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

Set local API secrets in `apps/api/.env` if you skip `pnpm init:local`:

```env
REFRESH_TOKEN_HMAC_SECRET=replace-with-at-least-32-characters
OTP_HMAC_SECRET=replace-with-at-least-32-characters
```

Leave `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` empty for local development. The API
generates development keys under `apps/api/.dev-keys/`.

Provider credentials remain manual:

- SMTP settings are required for API startup and real email delivery.
- Google and Apple credentials are required only when enabling those methods.
- SMSO credentials are required only when `SMS_PROVIDER=smso`.

Local URLs:

- Web: <http://localhost:3001>
- API: <http://localhost:3000>
- Swagger: <http://localhost:3000/api-docs>
- Health: <http://localhost:3000/healthz>
- JWKS: <http://localhost:3000/.well-known/jwks.json>
- Storybook: <http://localhost:6006> after `pnpm --filter @repo/ui dev`

## Daily Commands

| Command                        | Purpose                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`                     | Run development tasks across the workspace.                                          |
| `pnpm build`                   | Build all packages/apps.                                                             |
| `pnpm lint`                    | Run ESLint.                                                                          |
| `pnpm check-types`             | Run TypeScript checks.                                                               |
| `pnpm test`                    | Run unit/package tests.                                                              |
| `pnpm test:e2e`                | Run API E2E tests.                                                                   |
| `pnpm init:local`              | Configure local env files, Docker Postgres, DB, seed, and shared builds after clone. |
| `pnpm gen`                     | Regenerate env example and OpenAPI after API changes.                                |
| `pnpm --filter api db:migrate` | Create/apply local Prisma migrations.                                                |
| `pnpm --filter api db:deploy`  | Apply migrations without creating new ones.                                          |
| `pnpm --filter api db:seed`    | Seed local/test data.                                                                |
| `pnpm --filter @repo/ui dev`   | Run Storybook.                                                                       |

## `pnpm init:local` Options

```bash
pnpm init:local --help
pnpm init:local --yes
pnpm init:local --skip-docker
pnpm init:local --skip-db
pnpm init:local --skip-seed
pnpm init:local --skip-build
pnpm init:local --regen-secrets
pnpm init:local --dry-run
```

Use `--yes` for a one-command default setup after clone. Use `--dry-run` to see
what would happen without changing files, Docker, or the database.

The command uses `pnpm --filter api db:deploy` for first-clone bootstrap because
it applies checked-in migrations without creating new migration files. Use
`pnpm --filter api db:migrate` only when changing the Prisma schema during
development.

## Adding Or Changing An API Endpoint

Use shared contracts first:

1. Add request/response schemas and inferred types in `packages/api-shared/src/v1`.
2. Add route constants in the same domain package.
3. Add runtime validation tests in `packages/api-shared/test`.
4. Wrap the schemas in NestJS DTOs and use them in the controller/service.
5. Add or update API unit/E2E tests.
6. Regenerate OpenAPI with `pnpm gen` when the HTTP surface changes.
7. Consume the schema/types from web or mobile. Do not duplicate wire shapes.

Keep endpoints under `/v1` unless they are operational endpoints such as
`/healthz`, `/api-docs`, or JWKS.

## Working On Auth

Auth changes have a higher review bar because token rotation, cookies, JWKS,
CSRF, OAuth, and native clients are coupled.

Before changing auth:

- Read [auth/README.md](auth/README.md).
- Read [auth/refresh-rotation.md](auth/refresh-rotation.md).
- Read [../AGENTS.md](../AGENTS.md), especially the auth rule.
- Confirm the API, web, and `@repo/api-shared` contract impact.

Rules:

- Do not add NextAuth, Auth.js, Lucia, or another auth framework.
- NestJS owns token issuance and refresh rotation.
- Web verifies access JWTs locally through API JWKS.
- Cookie-bearing mutations must include `X-Requested-With: fetch`.
- Use `apiFetch` unless there is a specific reason to write a manual fetch.

## Working With Prisma

This project uses Prisma 7. Do not rely on Prisma 6 patterns.

Rules:

- Check `apps/api/package.json` for installed Prisma versions before making
  Prisma changes.
- Read current Prisma docs before changing schema, generator config, migration
  commands, or client instantiation.
- Keep generated client imports pointed at `apps/api/src/generated/prisma`.
- Keep `datasource.url` in `apps/api/prisma.config.ts`.
- Keep `@prisma/adapter-pg` runtime construction and explicit pool settings.
- Do not run destructive reset commands unless the data-loss decision is made by
  a human.

## Adding UI

For web UI:

1. Prefer existing components from `@repo/ui`.
2. If a shared primitive is missing, add it to `packages/ui`.
3. Add a Storybook story for reusable components.
4. Use tokens from `@repo/theme`; add missing tokens before using new values.
5. Import app-specific UI only inside the app when it is not reusable.

For native UI:

1. Prefer `@repo/ui-native` `Dec*` components.
2. Consume theme values through `@repo/theme-native` and Unistyles.
3. Keep platform-specific code isolated to the mobile app unless it is reusable.

## Adding Or Changing Theme Tokens

All visual and motion decisions belong in `packages/theme/src/tokens/`.

Typical flow:

1. Add or adjust the token in the matching token file.
2. Run `pnpm --filter @repo/theme build`.
3. Consume the generated CSS/native output through `@repo/theme` or
   `@repo/theme-native`.
4. Run the affected app/package checks.

Allowed literals in app/component code are limited to structural values such as
`0`, `auto`, `none`, `transparent`, and layout keywords. When in doubt, add a
token.

## Environment Variables

API env is generated from `apps/api/src/config/env.ts`.

When adding a new API env var:

1. Add it to the Zod env schema with a description and default when appropriate.
2. Add cross-field validation in the same file when needed.
3. Run `pnpm gen:env`.
4. Update local `apps/api/.env`.
5. Document any operator-facing behavior in the relevant README/doc.

Web env is currently limited to:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Mobile env is not wired yet because mobile auth/API calls are not implemented.

## Git And Internal Publishing Hygiene

Before pushing to the private/internal GitHub repository:

```bash
git status --short
git ls-files | rg '(^|/)(\.env|\.env\.|\.dev-keys|\.next|dist|node_modules|Pods|\.turbo|tsconfig\.tsbuildinfo|\.DS_Store)(/|$)'
```

The second command should print nothing. If it prints tracked secrets, build
outputs, local caches, or generated native dependencies, stop and fix the Git
state before publishing.

Keep `openapi.json` tracked only as the current generated API contract snapshot.

## Troubleshooting

- API cannot connect to Postgres: confirm `docker compose ps`, port `5434`, and
  `DATABASE_URL`.
- Web has no session after login: confirm `NEXT_PUBLIC_API_URL`, CORS origins,
  cookie domain, and browser credentials behavior.
- Google button does not render: confirm both `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and
  API `GOOGLE_CLIENT_ID_WEB` are set.
- OTP email does not arrive: in non-production the code is `000000`; check SMTP
  settings only when testing real delivery.
- Prisma client import fails: run `pnpm --filter api db:generate` and confirm
  imports use generated output, not `@prisma/client`.
