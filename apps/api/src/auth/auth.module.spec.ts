import type { DynamicModule, Provider, Type } from "@nestjs/common";

import { AUTH_ENABLED_METHODS } from "./auth-method.registry";
import { AuthModule } from "./auth.module";
import { AuthCleanupService } from "./cleanup/auth-cleanup.service";
import { AppleAuthModule } from "./modules/apple/apple.module";
import { AuthMethodsController } from "./modules/core-auth/auth-methods.controller";
import { EmailOtpModule } from "./modules/email-otp/email-otp.module";
import { GoogleAuthModule } from "./modules/google/google.module";

describe("AuthModule", () => {
  it("registers enabled method modules and the controller from one snapshot", () => {
    const dynamicModule = AuthModule.forRoot({
      cleanup: { enabled: false },
      enabledMethods: ["apple", "emailOtp", "google", "google"],
    });

    expect(methodImports(dynamicModule.imports)).toEqual([
      EmailOtpModule,
      GoogleAuthModule,
      AppleAuthModule,
    ]);
    expect(dynamicModule.controllers).toEqual([AuthMethodsController]);

    const methods = enabledMethodsProvider(dynamicModule.providers);
    expect(methods).toEqual(["emailOtp", "google", "apple"]);
    expect(Object.isFrozen(methods)).toBe(true);
    expect(new AuthMethodsController(methods).enabledMethods()).toEqual({
      methods: ["emailOtp", "google", "apple"],
    });
  });

  it("omits disabled modules and supports an empty method response", () => {
    const dynamicModule = AuthModule.forRoot({
      cleanup: { enabled: false },
      enabledMethods: [],
    });
    const methods = enabledMethodsProvider(dynamicModule.providers);

    expect(methodImports(dynamicModule.imports)).toEqual([]);
    expect(new AuthMethodsController(methods).enabledMethods()).toEqual({
      methods: [],
    });
  });

  it("keeps cleanup scheduling independent from auth methods", () => {
    const withoutCleanup = AuthModule.forRoot({
      cleanup: { enabled: false },
      enabledMethods: ["emailOtp"],
    });
    const withCleanup = AuthModule.forRoot({
      cleanup: { enabled: true },
      enabledMethods: [],
    });

    expect(withoutCleanup.providers).not.toContain(AuthCleanupService);
    expect(withCleanup.providers).toContain(AuthCleanupService);
    expect(methodImports(withCleanup.imports)).toEqual([]);
  });
});

function methodImports(imports: DynamicModule["imports"]): Type<unknown>[] {
  const methodModules = new Set<Type<unknown>>([
    EmailOtpModule,
    GoogleAuthModule,
    AppleAuthModule,
  ]);

  return (imports ?? []).filter(
    (entry): entry is Type<unknown> =>
      typeof entry === "function" && methodModules.has(entry),
  );
}

function enabledMethodsProvider(
  providers: Provider[] | undefined,
): readonly ("emailOtp" | "google" | "apple")[] {
  const provider = providers?.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "provide" in candidate &&
      candidate.provide === AUTH_ENABLED_METHODS,
  );

  if (!provider || !("useValue" in provider)) {
    throw new Error("AUTH_ENABLED_METHODS provider is missing");
  }

  return provider.useValue as readonly ("emailOtp" | "google" | "apple")[];
}
