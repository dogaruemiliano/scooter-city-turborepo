/**
 * Pure data shape consumed by [`AuthModule.forRoot`](./auth.module.ts).
 *
 * `buildAuthConfig(env)` translates the env-validated booleans into this
 * structured form so the dynamic-module factory doesn't know the underlying
 * env-var names. Tests can hand-craft a config without reading `process.env`.
 */
import type { v1 } from "@repo/api-shared";

import type { Env } from "../config/env";
import { resolveEnabledAuthMethodIds } from "./auth-method.registry";

export interface AuthModuleConfig {
  /** Daily 03:00 cron that deletes expired refresh tokens, stale OTPs, and old revoked sessions. */
  cleanup: { enabled: boolean };
  enabledMethods: readonly v1.auth.AuthMethodId[];
}

/**
 * Build the auth-module config from the validated env. Single source of
 * truth for the env → config mapping so the factory stays free of
 * `env.AUTH_X_ENABLED` references.
 */
export function buildAuthConfig(env: Env): AuthModuleConfig {
  return {
    cleanup: { enabled: env.AUTH_CLEANUP_ENABLED },
    enabledMethods: resolveEnabledAuthMethodIds(env),
  };
}
