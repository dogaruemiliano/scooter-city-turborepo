import type { Type } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type { Env } from "../config/env";
import { AppleAuthModule } from "./modules/apple/apple.module";
import { EmailOtpModule } from "./modules/email-otp/email-otp.module";
import { GoogleAuthModule } from "./modules/google/google.module";

type AuthMethodEnvKey =
  | "AUTH_EMAIL_OTP_ENABLED"
  | "AUTH_GOOGLE_ENABLED"
  | "AUTH_APPLE_ENABLED";

interface AuthMethodRegistration {
  envKey: AuthMethodEnvKey;
  module: Type<unknown>;
}

export const AUTH_ENABLED_METHODS = Symbol("AUTH_ENABLED_METHODS");

export const AUTH_METHOD_REGISTRY = {
  emailOtp: {
    envKey: "AUTH_EMAIL_OTP_ENABLED",
    module: EmailOtpModule,
  },
  google: {
    envKey: "AUTH_GOOGLE_ENABLED",
    module: GoogleAuthModule,
  },
  apple: {
    envKey: "AUTH_APPLE_ENABLED",
    module: AppleAuthModule,
  },
} satisfies Record<v1.auth.AuthMethodId, AuthMethodRegistration>;

export function resolveEnabledAuthMethodIds(env: Env): v1.auth.AuthMethodId[] {
  return v1.auth.AUTH_METHOD_IDS.filter(
    (method) => env[AUTH_METHOD_REGISTRY[method].envKey],
  );
}

export function resolveEnabledAuthMethodModules(
  methods: readonly v1.auth.AuthMethodId[],
): Type<unknown>[] {
  return v1.auth.AUTH_METHOD_IDS.filter((method) =>
    isAuthMethodEnabled(methods, method),
  ).map((method) => AUTH_METHOD_REGISTRY[method].module);
}

export function isAuthMethodEnabled(
  methods: readonly v1.auth.AuthMethodId[],
  method: v1.auth.AuthMethodId,
): boolean {
  return methods.includes(method);
}
