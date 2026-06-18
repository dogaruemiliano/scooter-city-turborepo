import { v1 } from "@repo/api-shared";

import { loadEnv, type Env } from "../config/env";
import {
  AUTH_METHOD_REGISTRY,
  isAuthMethodEnabled,
  resolveEnabledAuthMethodIds,
  resolveEnabledAuthMethodModules,
} from "./auth-method.registry";
import { AppleAuthModule } from "./modules/apple/apple.module";
import { EmailOtpModule } from "./modules/email-otp/email-otp.module";
import { GoogleAuthModule } from "./modules/google/google.module";

type AuthToggleOverrides = Partial<
  Pick<
    Env,
    "AUTH_EMAIL_OTP_ENABLED" | "AUTH_GOOGLE_ENABLED" | "AUTH_APPLE_ENABLED"
  >
>;

describe("auth method registry", () => {
  it("matches the canonical shared method IDs", () => {
    expect(Object.keys(AUTH_METHOD_REGISTRY)).toEqual([
      ...v1.auth.AUTH_METHOD_IDS,
    ]);
  });

  it("maps every method to a boolean Env property", () => {
    const env = createEnv();

    for (const method of v1.auth.AUTH_METHOD_IDS) {
      expect(typeof env[AUTH_METHOD_REGISTRY[method].envKey]).toBe("boolean");
    }
  });

  it("returns no methods when all flags are disabled", () => {
    expect(resolveEnabledAuthMethodIds(createEnv())).toEqual([]);
  });

  it.each([
    ["emailOtp", { AUTH_EMAIL_OTP_ENABLED: true }],
    ["google", { AUTH_GOOGLE_ENABLED: true }],
    ["apple", { AUTH_APPLE_ENABLED: true }],
  ] as const)("selects %s independently", (method, overrides) => {
    expect(resolveEnabledAuthMethodIds(createEnv(overrides))).toEqual([method]);
  });

  it("returns all enabled methods in canonical order", () => {
    expect(
      resolveEnabledAuthMethodIds(
        createEnv({
          AUTH_EMAIL_OTP_ENABLED: true,
          AUTH_GOOGLE_ENABLED: true,
          AUTH_APPLE_ENABLED: true,
        }),
      ),
    ).toEqual(["emailOtp", "google", "apple"]);
  });

  it("resolves enabled modules once and in canonical order", () => {
    expect(
      resolveEnabledAuthMethodModules([
        "apple",
        "google",
        "emailOtp",
        "google",
      ]),
    ).toEqual([EmailOtpModule, GoogleAuthModule, AppleAuthModule]);
  });

  it("omits disabled modules", () => {
    expect(resolveEnabledAuthMethodModules(["google"])).toEqual([
      GoogleAuthModule,
    ]);
  });

  it("checks membership using typed method IDs", () => {
    expect(isAuthMethodEnabled(["emailOtp"], "emailOtp")).toBe(true);
    expect(isAuthMethodEnabled(["emailOtp"], "google")).toBe(false);
  });
});

function createEnv(overrides: AuthToggleOverrides = {}): Env {
  return {
    ...loadEnv(),
    AUTH_EMAIL_OTP_ENABLED: false,
    AUTH_GOOGLE_ENABLED: false,
    AUTH_APPLE_ENABLED: false,
    ...overrides,
  };
}
