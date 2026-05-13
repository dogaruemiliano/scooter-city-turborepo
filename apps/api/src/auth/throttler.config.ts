/**
 * Named throttler buckets used by the auth endpoints.
 *
 * Buckets are named so different endpoints can mix the right combination
 * via `@Throttle({ "<name>": {} })`. The actual limit values come from
 * env (`THROTTLE_*` keys), so downstream projects can tune without code
 * changes.
 *
 * Storage is `@nestjs/throttler`'s default in-memory store. That means
 * each API process tracks its own counters — under multi-instance
 * deployment, real limits are roughly `N × configured` where `N` is the
 * pod count. Documented as a known limitation in
 * [docs/auth/rate-limiting.md](../../../docs/auth/rate-limiting.md);
 * Redis storage is on the post-v1 follow-up list.
 */
import type { ThrottlerOptions } from "@nestjs/throttler";

import type { Env } from "../config/env";

export const THROTTLER_NAMES = {
  /** Per-IP cap on OTP requests, 1h window. */
  otpIp: "otp-ip",
  /** Per-target (email/phone) cap on OTP requests, 1h window. */
  otpTarget: "otp-target",
  /** Per-target daily cap on OTP requests, 24h window. */
  otpTargetDaily: "otp-target-daily",
  /** Per-IP cap on login endpoints, 1min window. */
  loginIp: "login-ip",
} as const;

export function buildThrottlerOptions(env: Env): ThrottlerOptions[] {
  return [
    {
      name: THROTTLER_NAMES.otpIp,
      ttl: 60 * 60 * 1000, // 1 hour
      limit: env.THROTTLE_OTP_PER_IP_PER_HOUR,
    },
    {
      name: THROTTLER_NAMES.otpTarget,
      ttl: 60 * 60 * 1000,
      limit: env.THROTTLE_OTP_PER_TARGET_PER_HOUR,
    },
    {
      name: THROTTLER_NAMES.otpTargetDaily,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      limit: env.THROTTLE_OTP_PER_TARGET_PER_DAY,
    },
    {
      name: THROTTLER_NAMES.loginIp,
      ttl: 60 * 1000, // 1 minute
      limit: env.THROTTLE_LOGIN_PER_IP_PER_MIN,
    },
  ];
}
