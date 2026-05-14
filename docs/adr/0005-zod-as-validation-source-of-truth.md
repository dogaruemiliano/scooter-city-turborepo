# ADR 0005 — Zod as the validation source of truth

- **Status:** Accepted
- **Date:** 2026-05-14
- **Deciders:** template author

## Context

Before this change, request-body validation in the NestJS API used `class-validator` decorators on hand-written DTO classes. The web (Next.js) and mobile (Expo) apps had no shared validators — Zod fragments existed in `@repo/api-shared/src/schemas.ts` but only covered three primitives (`emailSchema`, `phoneSchema`, `otpCodeSchema`), and weren't wired into the API. The Orval-generated client in `packages/api-generated/` produced TypeScript types from `openapi.json`, which `@nestjs/swagger` derived from `@ApiProperty` decorators on the same hand-written classes.

That setup left three places where the same field's rules could be expressed: class-validator decorators on the server, Zod fragments in `api-shared`, and `@ApiProperty` metadata for OpenAPI. The three could drift silently — a min-length tightened on the server with no corresponding update on the client, or a new field added to the schema but missed in the OpenAPI annotations. Bugs caused by that drift would only surface in production, when a client sent data the API now rejected.

## Decision

**Zod schemas in `packages/api-shared/src/v1/` are the single source of truth for every field rule on every `/v1/*` endpoint.** The NestJS API consumes them via `nestjs-zod` (`createZodDto` + the global `ZodValidationPipe`). `@nestjs/swagger` emits OpenAPI from those same schemas — `nestjs-zod` patches Nest's metadata factory so DTOs derived from `createZodDto` produce correct OpenAPI, and `cleanupOpenApiDoc()` runs on the resulting document. Orval regenerates the typed client downstream. Web and mobile forms (in later PRs) consume the same schemas via `@hookform/resolvers/zod`.

The Zod major version is **Zod 4** (pinned to `^4.4.3`). `nestjs-zod` 5.x requires `zod >= 3.25 || >= 4.0`; we picked 4 because it is the current line, has built-in `z.toJSONSchema()`, and avoids the deprecation surface of Zod 3 chains (`.string().email()` → `.email()`).

## Folder convention

Schemas live under `packages/api-shared/src/v1/` organized by domain. Each domain folder contains up to five files:

```
v1/
├── auth/
│   ├── auth.schemas.ts     ← Zod schemas
│   ├── auth.constants.ts   ← cookie names, route paths, header names, role enums
│   ├── auth.types.ts       ← TypeScript-only shapes
│   ├── auth.errors.ts      ← (added when needed) shared error code enums
│   └── index.ts
└── common/
    ├── common.schemas.ts   ← cross-domain primitives
    └── index.ts
```

The root barrel re-exports each version as a namespace:

```ts
// packages/api-shared/src/index.ts
export * as v1 from "./v1";
```

Consumers always reach through the version namespace — `v1.auth.refreshTokensSchema`, `v1.common.emailSchema`, `v1.auth.ACCESS_TOKEN_COOKIE`. There are no flat top-level re-exports. The cost of slightly longer import paths is paid back by every call site naming the version it depends on, which makes a future `v2/` migration mechanical.

## Versioning rule

- **Frozen at release.** Once `v1/` ships, its schemas, constants, and types are immutable. Adding new optional fields is allowed; renaming, removing, or tightening existing fields is not.
- **Breaking changes go in a new version.** Create `v2/` next to `v1/`, copy only the domains that genuinely changed, and re-export the unchanged ones from `v1`. NestJS controllers move to `/v2/*` paths; `v1/*` keeps running until clients migrate.
- **Common primitives** in `v1/common/` are re-exported by future versions until a breaking change forces a fork.

## Reasoning

1. **Single source eliminates drift.** A field rule lives in one file. The API validates with it, web/mobile forms validate with it, and OpenAPI emits from it.
2. **TypeScript types come from `z.infer<typeof X>` — never hand-written.** A schema change automatically updates every type that depends on it.
3. **Domain folders scale.** Five tiny files in a folder named after the resource is easier to navigate than one growing schemas file. New domains add cleanly; existing domains stay small.
4. **Version-namespaced imports surface the version every time.** When `v2` lands, call sites that need to update are visible; call sites still on `v1` are explicit about it.
5. **`nestjs-zod` is the only viable bridge.** It generates correct OpenAPI from Zod via `z.toJSONSchema()`, ships a working validation pipe + serializer interceptor, and is actively maintained (v5 series). Building a custom bridge would duplicate work without benefit.

## Trade-offs accepted

- **Verbosity at call sites.** `v1.auth.ACCESS_TOKEN_COOKIE` is wordier than `ACCESS_TOKEN_COOKIE`. Acceptable; the version-awareness payoff is worth it for a template intended to outlive a single API revision.
- **`nestjs-zod` dependency surface.** We now depend on a library that wraps `@nestjs/swagger`'s metadata factory and post-processes the OpenAPI doc. If upstream breaks the integration we're stuck investigating their internals. Mitigated by Zod 4's `z.toJSONSchema()` being stable and the library's small surface area.
- **Two coexisting validation libraries.** `class-validator` and `class-transformer` stay in `apps/api/package.json` until every DTO is migrated. Only one DTO exists today (`RefreshTokensDto`) and it's already on Zod, so the cleanup PR can drop them once a second DTO is migrated.
- **Zod 4 internals are explicitly unstable.** Anything that pokes at `_zod.def` (e.g. the env-example generator) must be written defensively, prefer `z.toJSONSchema()` over inspecting schemas directly, and accept that minor Zod 4.x bumps may need follow-up.

## Consequences

- **API endpoints validate, the OpenAPI doc emits, and the Orval client compiles from one schema definition.** The pipeline (`pnpm gen`) is the canonical sync mechanism: change a schema, run `pnpm gen`, downstream clients update.
- **`AllExceptionsFilter`** now branches on `ZodValidationException` (400 with normalized `details[]` of `{ path, code, message }`) and `ZodSerializationException` (500, logged with the underlying ZodError) before falling through to the legacy `HttpException` path. Raw `ZodError` thrown outside any pipe is also normalized.
- **`AppModule`** registers `ZodValidationPipe` and `ZodSerializerInterceptor` globally via `APP_PIPE` and `APP_INTERCEPTOR`. The interceptor is a no-op until a controller method is decorated with `@ZodSerializerDto(...)` or `@ZodResponse({ type })` — it doesn't change the wire shape of existing responses, but it's wired and ready.
- **`main.ts`** wraps every emitted swagger document in `cleanupOpenApiDoc()`. The `--spec-only` pipeline output is the cleaned version that Orval consumes.
- **The `v1/README.md`** in `packages/api-shared/src/v1/` documents the folder convention, how to add a schema, and how to add a domain — read it before the next time you add a `/v1/*` endpoint.

## Out of scope (deferred PRs)

- **Web + mobile form integration.** Once the auth controller actually accepts forms (signup, login, OTP request), the web and mobile sides wire `zodResolver(v1.auth.<schema>)` into their respective form libraries. This PR only proves the server side.
- **`class-validator` / `class-transformer` removal.** Drop them in a final cleanup PR after every DTO is on `createZodDto`.
- **i18n of Zod error messages.** `zod-i18n-map` integration belongs in a separate concern when localized errors are needed.
- **`v1/auth/auth.errors.ts` codified error codes.** Add the file when the first concrete need arises (e.g., codifying `OTP_EXPIRED` for client-side handling).
- **`@ZodResponse` / `@ZodSerializerDto` on response DTOs.** The serializer infra is wired; applying the decorators per-endpoint to enforce response schemas is a follow-up sweep.

## Verification

- `pnpm gen` runs the full pipeline (env → api-shared → api build → openapi → orval) without errors.
- `pnpm --filter api check-types` passes after the migration.
- The generated `openapi.json` contains a `RefreshTokensDto` schema with the right shape (`additionalProperties: false`, optional `refreshToken: string`, description preserved).
- `apps/api/test/api-shared.e2e-spec.ts` and `apps/api/test/core-auth-controller.e2e-spec.ts` pass.
