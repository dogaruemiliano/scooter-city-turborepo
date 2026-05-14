/**
 * Pure data shape consumed by [`AuthModule.forRoot`](./auth.module.ts).
 *
 * `buildAuthConfig(env)` translates the env-validated booleans into this
 * structured form so the dynamic-module factory doesn't have to know the
 * underlying env-var names. The split keeps the factory test-friendly: a
 * test can hand-craft a config object (e.g. enable only cleanup, disable
 * every method) without going through `process.env`.
 *
 * Method modules listed here are added in PRs 8-11; each PR will append a
 * conditional `imports.push(<Module>)` block inside `forRoot()` and an
 * entry to this config. Until those PRs land the flags exist but currently
 * map to no module wiring.
 */
import type { Env } from "../config/env";

export interface AuthModuleConfig {
  /** Daily 03:00 cron that deletes expired refresh tokens, stale OTPs, and old revoked sessions. */
  cleanup: { enabled: boolean };

  /** Email-OTP request/verify endpoints (PR 8). */
  emailOtp: { enabled: boolean };

  /** SMS-OTP request/verify endpoints (PR 11). */
  smsOtp: { enabled: boolean };

  /** Google Sign-in endpoint + ProviderVerificationModule wiring (PR 9). */
  google: { enabled: boolean };

  /** Sign in with Apple endpoint (PR 10). */
  apple: { enabled: boolean };
}

/**
 * Build the auth-module config from the validated env. Single source of
 * truth for the env → config mapping so the factory stays free of
 * `env.AUTH_X_ENABLED` references.
 */
export function buildAuthConfig(env: Env): AuthModuleConfig {
  return {
    cleanup: { enabled: env.AUTH_CLEANUP_ENABLED },
    emailOtp: { enabled: env.AUTH_EMAIL_OTP_ENABLED },
    smsOtp: { enabled: env.AUTH_SMS_OTP_ENABLED },
    google: { enabled: env.AUTH_GOOGLE_ENABLED },
    apple: { enabled: env.AUTH_APPLE_ENABLED },
  };
}
