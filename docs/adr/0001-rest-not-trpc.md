# ADR 0001 — REST + OpenAPI + Orval (not tRPC)

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** template author

## Context

The two reference repos this template draws from (`studently`, `m-turborepo`) both expose their API surface via **tRPC**. tRPC gives end-to-end type safety with zero codegen — the web app imports `AppRouter` from the API and gets typed procedures for free.

We are _not_ doing that here.

## Decision

The API contract is **REST**. Endpoints are documented via `@nestjs/swagger` decorators into an OpenAPI 3 document, served at `/api-docs-json`. The web client is generated from that document by **Orval** into `packages/api-generated`.

## Reasoning

1. **Multi-language clients.** The template is intended to seed projects that will sometimes add native mobile apps, third-party integrations, or CLIs. OpenAPI is consumable by ~every language's codegen; tRPC requires a TS consumer.
2. **Auth-as-cookies.** With HttpOnly cookies and no client-side token plumbing, the web client doesn't need a typed _transport_ layer — it just needs typed _request/response shapes_. Orval delivers exactly that without dragging in tRPC's runtime.
3. **Observability and ops tooling.** REST is a first-class citizen for every load balancer, WAF, CDN, OpenTelemetry exporter, Postman/Insomnia, gateway-level rate-limiting tool. tRPC routes show up as opaque POSTs to a single endpoint.
4. **Public surface.** When the time comes to expose an API to partners, REST + OpenAPI is the lingua franca. Re-exposing a tRPC router as a REST API after the fact is wasted work.
5. **Decoupling.** Web is free to rewrite to any framework that can call `fetch` and parse JSON. The contract is the OpenAPI doc, not a TS import graph.

The cost we accept: we lose tRPC's "rename a procedure and the web compiler complains." We get it back via `pnpm gen` regenerating `packages/api-generated` — a rename surfaces as a diff in generated code that the typechecker then catches at use sites.

## Consequences

- Every controller route MUST carry `@ApiOperation`, `@ApiBody` (where applicable), and `@ApiResponse` decorators. Without them, Orval emits weakly-typed signatures.
- A consistent error envelope is mandatory — see [the AllExceptionsFilter implementation](../../apps/api/src/common/filters/all-exceptions.filter.ts).
- `pnpm gen` is part of the PR workflow: any controller signature change must be followed by a regen commit. (A drift check in CI is on the post-v1 follow-up list.)
- Web app server actions wrap calls to `packages/api-generated`'s fetch client; they do not call `fetch` directly.

## Alternatives considered

- **tRPC.** Rejected for the reasons above.
- **GraphQL.** Heavier tooling for what is mostly CRUD; gateway-level rate limiting + caching is more awkward.
- **gRPC.** Internal-only, no browser story without grpc-web.
