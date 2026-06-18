/**
 * Side-effect module that runs BEFORE every other import in `main.ts`.
 *
 * Three responsibilities, all of which must happen before `app.module.ts`
 * evaluates `loadEnv()` at its top level (line ~30):
 *
 *   1. Load `.env` via `dotenv/config`. `@nestjs/config`'s `forRoot()`
 *      would normally do this, but its DI lifecycle runs AFTER the
 *      top-level `loadEnv()` call in `app.module.ts`. Explicit load up
 *      front means `process.env` is fully populated when validation runs.
 *
 *   2. Materialize the dev RSA keypair via `ensureDevJwtKeypair()`. No-op
 *      in production (which must provide `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`
 *      explicitly). In dev/test, writes (or reuses) `.dev-keys/*.pem` and
 *      injects them into `process.env`. Idempotent across restarts.
 *
 *   3. In `--spec-only` mode (Orval pipeline / CI spec generation), inject
 *      placeholder values for the remaining required vars so the env
 *      schema validates without a real `.env`. Force-enables every auth
 *      method so the generated OpenAPI document is complete. The
 *      placeholders have no security meaning — `--spec-only` exits
 *      immediately after writing stdout.
 *
 * The `dotenv/config` and `keys` imports are safe to hoist here: they
 * have no env-reading top-level side effects of their own, so loading
 * them doesn't cascade into config-module validation.
 */
import "dotenv/config";

import { ensureDevJwtKeypair } from "./auth/utils/keys";

ensureDevJwtKeypair();

if (process.argv.includes("--spec-only")) {
  const placeholders: Record<string, string> = {
    NODE_ENV: "development",
    REFRESH_TOKEN_HMAC_SECRET: "spec-only-placeholder-padded-to-32-chars",
    OTP_HMAC_SECRET: "spec-only-placeholder-padded-to-32-chars",
    AUTH_EMAIL_OTP_ENABLED: "true",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    SMTP_USER: "spec-only-user",
    SMTP_PASSWORD: "spec-only-password",
    AUTH_APPLE_ENABLED: "true",
    APPLE_SERVICE_ID: "com.example.spec.placeholder",
    AUTH_GOOGLE_ENABLED: "true",
    GOOGLE_CLIENT_ID_WEB: "spec-only-google-client-id-web.placeholder",
    SMS_PROVIDER: "log",
  };
  for (const [k, v] of Object.entries(placeholders)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
