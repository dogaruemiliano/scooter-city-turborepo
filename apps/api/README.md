# `api` — NestJS

REST API surface. Versioned at `/v1`. Documented via OpenAPI at `/api-docs`. Auth submodules ship in PR 5+; PR 1 is plumbing only (env, logger, request-id, healthcheck, exception filter, swagger).

## Dev

```bash
docker compose -f ../../docker-compose.yml up -d postgres
pnpm gen:env && cp .env.example .env   # fill in JWT_*_SECRET, *_HMAC_SECRET (≥32 chars each)
pnpm db:migrate                         # apply migrations
pnpm db:seed                            # idempotent test users
pnpm start:dev                          # :3000 with hot reload
```

Local Postgres runs on **`localhost:5434`** (not 5432) so the template
can coexist with any host-installed Postgres. See
[../../docker-compose.yml](../../docker-compose.yml).

## Endpoints (current)

| Method | Path             | Auth                    | Description                                       |
| ------ | ---------------- | ----------------------- | ------------------------------------------------- |
| `GET`  | `/healthz`       | public, version-neutral | Liveness + readiness probe (heap + DB indicators) |
| `GET`  | `/api-docs`      | public                  | Swagger UI                                        |
| `GET`  | `/api-docs-json` | public                  | Raw OpenAPI 3 spec                                |

Auth endpoints land in PR 5+. See [the ADR](../../docs/adr/0001-rest-not-trpc.md) and the docs in [docs/auth/](../../docs/auth/) (populated as features ship).

## Useful commands

```bash
pnpm start:dev      # watch mode
pnpm build          # prisma generate + nest build
pnpm spec           # emit OpenAPI JSON to stdout (used by `pnpm gen` from root)
pnpm lint           # eslint --fix
pnpm check-types    # tsc --noEmit
pnpm test           # unit tests (Jest)
pnpm test:e2e       # E2E tests (Jest + Supertest)

# Database (Prisma 7 — see ../../AGENTS.md → prisma-verify-rule)
pnpm db:migrate     # prisma migrate dev (creates + applies new migration)
pnpm db:deploy      # prisma migrate deploy (CI / prod — apply only)
pnpm db:seed        # prisma db seed (test fixtures; refuses in production)
pnpm db:studio      # prisma studio
pnpm db:generate    # regenerate the client into src/generated/prisma
pnpm db:reset       # destructive — drops + reapplies; AI-agent guarded
```

## Logging

`nestjs-pino` is the global logger. Pretty multi-line in `NODE_ENV !== production`, JSON otherwise. Every line carries `reqId` correlated with the `X-Request-Id` header on the corresponding HTTP request. Healthcheck pings are excluded from auto-logging to keep the dev console clean.

## Error shape

Every error response (whether thrown as `HttpException`, surfaced from `ValidationPipe`, or an uncaught `Error`) is normalized by `AllExceptionsFilter` to:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Validation failed",
    "details": ["email must be an email"],
    "requestId": "8f3c…"
  }
}
```

Reasoning: Orval clients want one error type. See [docs/adr/0001-rest-not-trpc.md](../../docs/adr/0001-rest-not-trpc.md) for the broader contract decision.

## Adding a new env var

1. Add the field to [src/config/env.ts](src/config/env.ts) with a `.describe(...)` line and (where applicable) a default.
2. Add cross-field requirements to the `.superRefine` block at the bottom of the same file.
3. From repo root, `pnpm gen:env` — `apps/api/.env.example` regenerates.
4. Update your local `apps/api/.env`.

The env example is auto-generated. **Don't hand-edit it.**
