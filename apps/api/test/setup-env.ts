/**
 * Runs BEFORE any `import` in the test files. Populates env vars that the
 * zod schema requires so `ConfigModule` doesn't throw on module load.
 *
 * As auth modules land, individual tests override specific vars via
 * `process.env.X = ...` in `beforeAll`.
 *
 * `ensureDevJwtKeypair()` materializes a stable RSA keypair under
 * `.dev-keys/` and injects `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (base64
 * PEMs) into env — the same code path dev runs through, so tests
 * exercise real RS256 signing and verification end-to-end.
 */
import { ensureDevJwtKeypair } from "../src/auth/utils/keys";

const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  REFRESH_TOKEN_HMAC_SECRET: "z".repeat(32),
  OTP_HMAC_SECRET: "q".repeat(32),
  DATABASE_URL: "postgresql://app:app@localhost:5434/app",
  // Enable Google with a stub web client ID so AppModule registers the
  // /v1/auth/google route. The e2e suite overrides `GoogleVerifier`
  // with `FakeGoogleVerifier` — the real client ID is never consulted.
  AUTH_GOOGLE_ENABLED: "true",
  GOOGLE_CLIENT_ID_WEB: "test-google-client-id-web",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_USER: "test-user",
  SMTP_PASSWORD: "test-password",
  HEALTH_MAX_HEAP_MB: "1024",
  OTP_DELIVERY_QUOTA_PER_TARGET_PER_HOUR: "10000",
  OTP_DELIVERY_QUOTA_PER_TARGET_PER_DAY: "10000",
  OTP_DELIVERY_QUOTA_PER_IP_PER_HOUR: "10000",
  THROTTLE_GLOBAL_PER_IP_PER_MIN: "10000",
  THROTTLE_OTP_REQUESTS_PER_IP_PER_MIN: "10000",
  THROTTLE_LOGIN_PER_IP_PER_MIN: "10000",
};

for (const [k, v] of Object.entries(TEST_ENV)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

ensureDevJwtKeypair();
