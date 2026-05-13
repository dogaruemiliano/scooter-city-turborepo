# ADR 0004 — Prisma as the ORM

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** template author

## Context

The template needs a persistence layer for users, sessions, refresh tokens, OTPs, OAuth account links, and audit events. The two reference repos (`studently`, `m-turborepo`) both use Prisma against Postgres. The decision is whether to inherit Prisma or switch to something else (Drizzle, TypeORM, Kysely, …).

## Decision

**Prisma with Postgres.**

## Reasoning

1. **Schema copy-over.** The most security-sensitive code in this repo is auth, and the cleanest copy targets are the reference repos' Prisma schemas + migrations. Translating to a different ORM introduces a translation bug surface for zero benefit.
2. **Migration ergonomics.** `prisma migrate dev` for development, `prisma migrate deploy` for production. Migration history is checked-in SQL — auditable, reviewable, and survives schema-tool churn.
3. **Type safety.** Prisma's generated client is one of the safer typed-query interfaces in the JS ecosystem. Pair it with zod at the controller boundary and we have type safety from request body to DB row.
4. **`FOR UPDATE` and transactions.** The refresh-token rotation logic depends on Prisma's `$transaction` with serializable isolation and raw `$queryRaw` for `SELECT … FOR UPDATE`. This is supported and battle-tested.
5. **Familiarity tax.** Most TS backend engineers know Prisma; new contributors won't need a ramp-up.

## Trade-offs accepted

- **Bundle size.** The generated client is large; a serverless deploy with a slow cold-start may suffer. Mitigation: we run as a long-lived process (NestJS), not lambda.
- **Edge incompatibility.** Prisma in Node-only mode is fine for our API. We do not run the API at the edge.
- **Performance ceiling.** For ultra-high-throughput workloads, Drizzle / Kysely beat Prisma. We are not building that. If a downstream project hits Prisma's ceiling, it can swap on a per-table basis.

## Consequences

- `packages/api-generated/`'s schemas come from OpenAPI, not Prisma — Prisma types stay confined to `apps/api`. The web app must never import `@prisma/client`.
- Migrations live at `apps/api/prisma/migrations/`. Every PR that touches the schema includes the migration.
- Seed data lives at `apps/api/prisma/seed.ts` with deterministic test users so E2E tests can rely on stable IDs.
- DB connection pool is Prisma's default (CPU-count); revisit if we see connection saturation in load tests.

## Alternatives considered

- **Drizzle.** Lighter, SQL-first, faster cold start. Rejected because every schema/query in the auth subsystem would need a hand-translation from the reference repos.
- **Kysely.** Excellent type safety, no codegen. Rejected for the same reason as Drizzle: porting cost.
- **TypeORM.** NestJS-idiomatic decorators-on-entities. Rejected because of historic migration-pain and a less polished query API than Prisma.
- **Raw `pg`.** Rejected — we'd reinvent migrations, type generation, and connection pooling for no gain.
