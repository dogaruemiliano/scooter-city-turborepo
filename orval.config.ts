/**
 * Orval config — generates a typed fetch client + zod schemas from the
 * API's OpenAPI spec at `openapi.json`.
 *
 * The pipeline:
 *   1. `pnpm gen:env`          — refresh .env.example from zod
 *   2. `pnpm --filter api build`
 *   3. `pnpm gen:openapi`      — `node apps/api/dist/main --spec-only > openapi.json`
 *   4. `pnpm gen:orval`        — this config emits into packages/api-generated/src
 *
 * The output package (`packages/api-generated`) lands in PR 2. Until then,
 * the orval target is silently skipped if `openapi.json` is missing.
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
