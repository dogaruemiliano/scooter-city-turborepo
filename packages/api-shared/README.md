# `@repo/api-shared`

Shared runtime contracts for the API, web app, and future native clients.

The package contains:

- Zod request and response schemas
- Inferred TypeScript types
- Authentication route constants
- Cookie names
- Shared validation primitives
- The runtime-neutral `apiFetch` client
- The `AuthAdapter` interface that lets web and native runtimes plug in their
  own refresh behavior

Import through the version namespace:

```ts
import { v1 } from "@repo/api-shared";

const path = v1.auth.ROUTES.emailOtp.verify;
const schema = v1.auth.enabledAuthMethodsSchema;
type Method = v1.auth.AuthMethodId;
```

## Source of truth

The schemas in `src/v1/` are authoritative:

- NestJS uses them for request validation and response serialization.
- OpenAPI is generated from the NestJS DTO wrappers.
- Web and native clients use the same schemas and inferred types.

Do not duplicate request or response shapes in an application package.

## Package layout

```text
src/
+-- api-fetch.ts
+-- index.ts
+-- v1/
    +-- auth/
    +-- common/
    +-- users/
```

Each domain exports through `v1.<domain>`.

## Adding a contract

1. Add the schema to the matching `src/v1/<domain>/` file.
2. Add `.meta({ id: "..." })` for OpenAPI.
3. Export it through the domain barrel.
4. Add a runtime test for validation behavior.
5. Add the NestJS DTO/controller usage.
6. Regenerate OpenAPI.

See [`src/v1/README.md`](./src/v1/README.md) for naming rules.

## Runtime fetch behavior

`apiFetch` is intentionally runtime-neutral. It knows how to:

- Prefix API paths with the configured API origin.
- Validate JSON responses with a provided Zod schema.
- Normalize API error responses.
- Add `X-Requested-With: fetch` for CSRF-protected cookie mutations.
- Delegate 401 refresh behavior to the active `AuthAdapter`.

The web app installs its adapter in
[`apps/web/src/lib/auth-adapter-web.ts`](../../apps/web/src/lib/auth-adapter-web.ts).
The mobile adapter is still missing; see
[`docs/missing-work.md`](../../docs/missing-work.md).

## Build behavior

TypeScript consumers read types from `src/`, while runtime imports use
`dist/`. Run:

```bash
pnpm --filter @repo/api-shared build
```

The API build already runs this command before compiling NestJS.

## Internal rule

Do not duplicate request/response shapes inside app packages. If a wire shape is
shared by API and client code, it belongs here first.
