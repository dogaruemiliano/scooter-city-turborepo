/**
 * Runs BEFORE any `import` in the test files. Populates env vars that the
 * zod schema requires so `ConfigModule` doesn't throw on module load.
 *
 * Real secrets are intentionally garbage — none of these tests cryptographically
 * verify anything in PR 1. As auth modules land, individual tests override
 * specific vars via `process.env.X = ...` in `beforeAll`.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  JWT_ACCESS_SECRET: "x".repeat(32),
  JWT_REFRESH_SECRET: "y".repeat(32),
  REFRESH_TOKEN_HMAC_SECRET: "z".repeat(32),
  OTP_HMAC_SECRET: "q".repeat(32),
  DATABASE_URL: "postgresql://app:app@localhost:5434/app",
  // Enable Google with a stub web client ID so AppModule registers the
  // /v1/auth/google route. The e2e suite overrides `GoogleVerifier`
  // with `FakeGoogleVerifier` — the real client ID is never consulted.
  AUTH_GOOGLE_ENABLED: "true",
  GOOGLE_CLIENT_ID_WEB: "test-google-client-id-web",
};

for (const [k, v] of Object.entries(TEST_ENV)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
