/**
 * Orval config — generates a typed fetch client from the API's OpenAPI
 * spec at `openapi.json`.
 *
 * The pipeline:
 *   1. `pnpm gen:env`          — refresh .env.example from zod
 *   2. `pnpm --filter api build`
 *   3. `pnpm gen:openapi`      — `node apps/api/dist/main --spec-only > openapi.json`
 *   4. `pnpm gen:orval`        — this config emits into packages/api-generated/src
 *
 * Validation-rule source of truth:
 *   Zod schemas in `packages/api-shared/src/v1/` are the canonical
 *   definitions. NestJS consumes them via `nestjs-zod`'s `createZodDto`
 *   and emits OpenAPI through `@nestjs/swagger` + `cleanupOpenApiDoc()`.
 *   Orval generates TypeScript request/response types from that OpenAPI
 *   doc — so the wire types are downstream of the same schemas the API
 *   validates against. Web + mobile forms validate with the same schemas
 *   imported directly from `@repo/api-shared`. No second Orval target
 *   that emits Zod is needed; the schemas are already shared.
 */
import { defineConfig } from "orval";

export default defineConfig({
  apiGenerated: {
    input: "./openapi.json",
    output: {
      target: "./packages/api-generated/src/index.ts",
      client: "fetch",
      mode: "single",
      override: {
        mutator: {
          path: "./packages/api-generated/src/mutator.ts",
          name: "customFetch",
        },
        useNativeEnums: true,
      },
    },
    hooks: { afterAllFilesWrite: "prettier --write" },
  },
});
