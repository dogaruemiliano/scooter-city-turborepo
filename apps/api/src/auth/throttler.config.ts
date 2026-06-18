import type { ThrottlerOptions } from "@nestjs/throttler";

import type { Env } from "../config/env";

export const THROTTLER_NAMES = {
  /** Nest's default name keeps standard unsuffixed rate-limit headers. */
  global: "default",
  /** Short per-IP burst cap for OTP request and resend routes. */
  otpRequestBurst: "otp-request-burst",
  /** Short per-IP burst cap for OAuth token exchanges. */
  loginIp: "login-ip",
} as const;

export function buildThrottlerOptions(env: Env): ThrottlerOptions[] {
  return [
    {
      name: THROTTLER_NAMES.global,
      ttl: 60 * 1000,
      limit: env.THROTTLE_GLOBAL_PER_IP_PER_MIN,
    },
    {
      name: THROTTLER_NAMES.otpRequestBurst,
      ttl: 60 * 1000,
      limit: env.THROTTLE_OTP_REQUESTS_PER_IP_PER_MIN,
    },
    {
      name: THROTTLER_NAMES.loginIp,
      ttl: 60 * 1000,
      limit: env.THROTTLE_LOGIN_PER_IP_PER_MIN,
    },
  ];
}
