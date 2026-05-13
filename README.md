# turborepo-full-template-v2

Opinionated turborepo template seed: NestJS API · Next.js 16 web · shared TS/ESLint configs · Postgres · OpenAPI + Orval for the API contract.

Status: **PR 1 (plumbing) landed.** Auth modules begin in PR 5. See [docs/adr/](docs/adr/) for the decision record and [docs/auth/](docs/auth/) (populated as features land) for cross-cutting auth docs.

## Prerequisites

- Node **≥ 20** (uses native `crypto.randomUUID`, `fetch`, etc.)
- pnpm **9** (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- Docker (for local Postgres)

## Quick start

```bash
# 1. Local Postgres
docker compose up -d postgres

# 2. Install
pnpm install

# 3. Configure secrets — generate the example, copy, fill in the SECRETS sections
pnpm gen:env
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env to set JWT_*_SECRET, REFRESH_TOKEN_HMAC_SECRET, OTP_HMAC_SECRET
# (each must be ≥ 32 chars; `openssl rand -hex 32` is handy)

# 4. Dev
pnpm dev                    # all apps via turbo
# or:
pnpm --filter api start:dev # only the API on :3000
```

Once the API is up:

- Swagger UI: <http://localhost:3000/api-docs>
- OpenAPI JSON: <http://localhost:3000/api-docs-json>
- Healthcheck: <http://localhost:3000/healthz>

## Workspace layout

```
apps/
├─ api/                NestJS 11 · REST · OpenAPI · pino · cookies-only sessions
├─ web/                Next.js 16 (App Router) — auth wiring lands in a later session
└─ docs/               Minimal docs site
packages/
├─ eslint-config/      Shared ESLint config (@repo/eslint-config)
├─ typescript-config/  Shared tsconfigs (@repo/typescript-config)
└─ ui/                 Shared React UI primitives (@repo/ui)
```

Two more packages land in PR 2:

- `packages/api-shared` — hand-written: cookie names, session types, route paths.
- `packages/api-generated` — `pnpm gen` output. **Do not edit by hand.**

## Common scripts

| Script             | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `pnpm dev`         | Run every app's dev task via turbo                                 |
| `pnpm build`       | Build every app                                                    |
| `pnpm lint`        | ESLint across the workspace                                        |
| `pnpm check-types` | `tsc --noEmit` across the workspace                                |
| `pnpm test`        | Unit tests (Jest)                                                  |
| `pnpm test:e2e`    | E2E tests (Jest+Supertest for API; Playwright lands later for web) |
| `pnpm gen`         | Regenerate `.env.example` + OpenAPI spec + Orval client            |
| `pnpm gen:env`     | Refresh `apps/api/.env.example` from the zod schema only           |
| `pnpm format`      | Prettier across the workspace                                      |

## Documentation map

- [docs/adr/](docs/adr/) — Architecture Decision Records (the _why_ for load-bearing choices)
- [docs/auth/](docs/auth/) — Auth subsystem cross-cutting docs (lands as auth modules ship)
- Per-app READMEs in each `apps/*` directory
- Per-package READMEs in each `packages/*` directory

The template's value is being readable months later. Every new feature ships with: OpenAPI decorators on every route, JSDoc on every public service method, a `docs/<area>/*.md` for any non-obvious mechanism, and an ADR for load-bearing decisions.

## Enabling / disabling auth methods

Once auth modules land, the source of truth is **API env vars**, not a checked-in config file:

| Env var                    | Default | Effect                                      |
| -------------------------- | ------- | ------------------------------------------- |
| `AUTH_EMAIL_OTP_ENABLED`   | `true`  | Wires `/v1/auth/email-otp/{request,verify}` |
| `AUTH_SMS_OTP_ENABLED`     | `false` | Wires `/v1/auth/sms-otp/{request,verify}`   |
| `AUTH_CREDENTIALS_ENABLED` | `true`  | Wires signup/login/reset endpoints          |
| `AUTH_GOOGLE_ENABLED`      | `false` | Wires `/v1/auth/google`                     |
| `AUTH_FACEBOOK_ENABLED`    | `false` | Wires `/v1/auth/facebook`                   |
| `AUTH_APPLE_ENABLED`       | `false` | Wires `/v1/auth/apple`                      |

Disabled methods don't just hide — their routes don't exist, their providers aren't registered, their env vars aren't required. The future web app reads `GET /v1/auth/enabled-methods` at SSR to know which buttons/forms to render. No `NEXT_PUBLIC_*` mirroring needed.

## License

UNLICENSED — internal template.
