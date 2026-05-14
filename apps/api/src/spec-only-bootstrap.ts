/**
 * Side-effect module that runs BEFORE every other import in `main.ts`.
 *
 * Why this file exists: ESM imports are hoisted. `NestConfigModule.forRoot`
 * runs zod validation the moment `app.module.ts` (and transitively
 * `config.module.ts`) is loaded — before any `bootstrap()` body runs. So
 * we cannot wait until inside `bootstrap()` to populate placeholder env
 * vars for `--spec-only` mode; we have to do it as a side effect that is
 * imported FIRST.
 *
 * In `--spec-only` mode (Orval pipeline / CI spec generation) we don't
 * need real secrets — the bootstrap exits immediately after writing the
 * OpenAPI document to stdout. These placeholders satisfy the zod schema
 * with values that have no security meaning.
 */
if (process.argv.includes("--spec-only")) {
  const placeholders: Record<string, string> = {
    NODE_ENV: "development",
    JWT_ACCESS_SECRET: "spec-only-placeholder-padded-to-32-chars",
    JWT_REFRESH_SECRET: "spec-only-placeholder-padded-to-32-chars",
    REFRESH_TOKEN_HMAC_SECRET: "spec-only-placeholder-padded-to-32-chars",
    OTP_HMAC_SECRET: "spec-only-placeholder-padded-to-32-chars",
    // Force-enable every auth method so the generated OpenAPI document
    // is complete (consumers shouldn't have to set env flags to see a
    // route in the spec). The credentials are placeholders the verifier
    // never actually consumes — `--spec-only` exits before any incoming
    // request reaches the verifier.
    AUTH_APPLE_ENABLED: "true",
    APPLE_SERVICE_ID: "com.example.spec.placeholder",
    AUTH_GOOGLE_ENABLED: "true",
    GOOGLE_CLIENT_ID_WEB: "spec-only-google-client-id-web.placeholder",
  };
  for (const [k, v] of Object.entries(placeholders)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
