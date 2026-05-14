# `v1/` — Versioned API contract

Everything under this folder corresponds to the `/v1/*` API surface. Schemas, constants, and types here are the **source of truth** for every consumer: the NestJS API validates with them, web + mobile forms validate with them, and `@nestjs/swagger` emits OpenAPI from them. The Orval-generated client in `packages/api-generated/` is downstream of those schemas — never edit it by hand.

## Versioning rule (read this first)

- **Once a version's surface is released, that folder is frozen.** Never edit a schema, constant, or type under `v1/` after release. If you do, you risk breaking already-deployed clients that pinned the field shape.
- **Breaking changes go in a new version.** Create a `v2/` next to `v1/`, copy only the domains that genuinely changed, and re-export the unchanged ones from `v1`. The NestJS API mounts `v2` routes under `/v2/*` and keeps `v1` controllers running until clients migrate.
- **Additions are allowed within a version when they're truly additive:** new optional fields on a schema, new endpoints, new constants. Anything else — renamed fields, type changes, removed fields — requires a new version.

## Folder structure

```
v1/
├── README.md              ← this file
├── index.ts               ← re-exports each domain as a namespace
├── auth/                  ← one folder per API domain
│   ├── index.ts
│   ├── auth.schemas.ts    ← Zod schemas for request/response bodies
│   ├── auth.constants.ts  ← cookie names, route paths, header names, role enums
│   ├── auth.types.ts      ← TypeScript-only shapes (no runtime), discriminated unions
│   └── auth.errors.ts     ← (added when needed) shared error code enums
└── common/                ← cross-domain primitives
    ├── index.ts
    └── common.schemas.ts  ← emailSchema, phoneSchema, otpCodeSchema, etc.
```

Each domain folder is named after the API resource (`auth`, `users`, `appointments`, etc.) and contains up to five files. Use the file that matches the export's kind — keeping schemas, constants, types, and errors in separate files makes the package's surface easy to scan.

## Import pattern

Always import the `v1` namespace, then drill into the domain:

```ts
import { v1 } from "@repo/api-shared";

// Schemas
const loginSchema = v1.auth.loginSchema;
const email = v1.common.emailSchema;

// Constants
const accessTokenCookie = v1.auth.ACCESS_TOKEN_COOKIE;
const refreshPath = v1.auth.ROUTES.refresh;

// Types
type User = v1.auth.SessionUser;
```

Avoid `import * as v1 from "@repo/api-shared/v1"` — the public barrel is `@repo/api-shared` and that's what every other workspace expects to resolve.

For backward compatibility, a small set of legacy top-level exports (`ACCESS_TOKEN_COOKIE`, `emailSchema`, `ROUTES`, etc.) still works from `@repo/api-shared` directly. New code should prefer the `v1.*` form so it's obvious which version is being used.

## How to add a new schema to an existing domain

Walk-through: adding `requestPasswordResetSchema` to `auth/`.

1. Open `v1/auth/auth.schemas.ts` and add:
   ```ts
   export const requestPasswordResetSchema = z
     .object({
       email: v1Common.emailSchema, // or import directly from "../common/common.schemas"
     })
     .strict();
   export type RequestPasswordResetInput = z.infer<
     typeof requestPasswordResetSchema
   >;
   ```
2. No re-export change is needed — `v1/auth/index.ts` already does `export * from "./auth.schemas"`.
3. In `apps/api`, create the DTO class:
   ```ts
   import { createZodDto } from "nestjs-zod";
   import { v1 } from "@repo/api-shared";
   export class RequestPasswordResetDto extends createZodDto(
     v1.auth.requestPasswordResetSchema,
   ) {}
   ```
4. Wire the DTO into the controller via `@Body() dto: RequestPasswordResetDto`. NestJS's global `ZodValidationPipe` (registered in `AppModule`) does the rest.
5. Run `pnpm gen`. The OpenAPI doc updates, Orval regenerates the typed client, and web/mobile consumers can use either the inferred Orval type or the shared schema for form validation.

## How to add a new domain

Walk-through: adding `users/`.

1. Create `v1/users/` with the four files (`users.schemas.ts`, `users.constants.ts`, `users.types.ts`, `index.ts`). Skip files that are empty — there's no value in stubs.
2. Add a barrel in `v1/users/index.ts` that re-exports whichever files you created.
3. Add `export * as users from "./users";` to `v1/index.ts`.
4. Consume in the API via `v1.users.*`. Done.

## What does NOT belong here

- **Auto-generated artifacts** — they live in `packages/api-generated/` and regenerate from the OpenAPI doc on every `pnpm gen`. Anything Orval can derive from the spec belongs there, not here.
- **App-specific UI helpers** — keep React hooks, Next.js helpers, Expo screens, etc. in their respective apps. This package must run unchanged in Node, Bun, browser, and React Native.
- **Inline literals in app code** — if a value is shared between server and client, put it here behind a named export. If you see a magic string repeated across the monorepo, it probably belongs in a domain's `*.constants.ts`.

## When the schema and Orval output diverge

The OpenAPI spec is generated from the schemas in this folder via `nestjs-zod` + `cleanupOpenApiDoc`. If `pnpm gen` produces an Orval-generated type that doesn't match the Zod schema, that's a bug — not something to paper over by patching `packages/api-generated/`. File an issue or fix `nestjs-zod`'s schema → OpenAPI translation.
