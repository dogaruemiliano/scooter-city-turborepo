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
 * The output package (`packages/api-generated`) lands in PR 2. Until then,
 * the orval target is silently skipped if `openapi.json` is missing.
 *
 * TODO(PR 5): once the first auth DTO ships, add a second target here
 * that emits zod schemas to `packages/api-generated/src/zod/`. Forms on
 * the web + mobile clients then import the same schema the API validates
 * against, so DTO-level rules (email format, password length, etc.) live
 * in exactly one place. See README at packages/api-shared for context.
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
