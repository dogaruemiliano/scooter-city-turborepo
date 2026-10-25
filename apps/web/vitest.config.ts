import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next replaces this boundary marker when compiling server components.
      "server-only": fileURLToPath(
        new URL(
          "./node_modules/next/dist/compiled/server-only/empty.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // These jsdom suites exercise complete forms. GitHub's two-core runner
    // takes substantially longer than a developer laptop for the same events.
    // Use one finite budget locally and in CI; never hide failures with retries.
    testTimeout: 15_000,
    // Turbo also runs API tests/builds. Leave CPU capacity for those tasks so
    // DOM-heavy interaction tests don't exhaust their timeout under contention.
    maxWorkers: "50%",
  },
});
