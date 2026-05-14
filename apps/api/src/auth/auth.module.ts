/**
 * The auth subsystem root module.
 *
 * `forRoot(config)` is a `DynamicModule` factory so per-method modules
 * (email-OTP, OAuth, SMS-OTP) can be conditionally added based on the
 * env-driven `AUTH_*_ENABLED` flags. Disabled methods don't just hide:
 * their routes don't exist (404), their providers aren't registered,
 * and their env vars aren't required.
 *
 * The factory takes a typed `AuthModuleConfig` rather than reading env
 * directly. `buildAuthConfig(env)` (see [./auth.config.ts](./auth.config.ts))
 * is the canonical converter. Hand-crafted configs in tests can disable
 * the cron, force-enable a method module, etc., without going through
 * `process.env`.
 *
 * `JwtModule` is registered once here at the root. Sibling submodules
 * that need `JwtService` (CoreAuthModule, and future method modules
 * that mint or verify JWTs directly) re-import `JwtModule` from their
 * own `@Module` decorator — Nest deduplicates the registration. Not
 * global on purpose: only the auth subsystem consumes JwtService.
 *
 * # Adding a new auth-method module (for PR 8-11)
 *
 * 1. Add a flag to `AuthModuleConfig` (e.g. `emailOtp: { enabled }`).
 * 2. In the matching branch below, push the module onto `imports` and
 *    the service (if it needs to be exported for other modules) onto
 *    `exports`.
 * 3. The method module re-imports `JwtModule` / `UsersModule` locally
 *    if it injects from them — Nest deduplicates.
 */
import { DynamicModule, Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

import type { AuthModuleConfig } from "./auth.config";
import { AuthCleanupService } from "./cleanup/auth-cleanup.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AppleAuthModule } from "./modules/apple/apple.module";
import { CoreAuthModule } from "./modules/core-auth/core-auth.module";
import { EmailOtpModule } from "./modules/email-otp/email-otp.module";
import { GoogleAuthModule } from "./modules/google/google.module";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { buildThrottlerOptions } from "./throttler.config";

@Module({})
export class AuthModule {
  /**
   * Build the auth module graph. The shape of `imports` and `providers`
   * varies with the supplied config — disabled features contribute
   * nothing to the graph (their providers aren't constructed, their
   * dependencies aren't required).
   */
  static forRoot(config: AuthModuleConfig): DynamicModule {
    const imports: DynamicModule["imports"] = [
      PassportModule.register({ defaultStrategy: "jwt" }),
      JwtModule.register({}),
      ThrottlerModule.forRootAsync({
        inject: [ENV],
        useFactory: (env: Env) => ({
          throttlers: buildThrottlerOptions(env),
        }),
      }),
      CoreAuthModule,
    ];

    const providers: Provider[] = [
      JwtStrategy,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ];

    // ─── Cleanup cron ──────────────────────────────────────────────
    // Independent of the method modules; just needs Schedule + Prisma.
    if (config.cleanup.enabled) {
      imports.push(ScheduleModule.forRoot());
      providers.push(AuthCleanupService);
    }

    // ─── Method modules (filled in by PR 8-11) ─────────────────────
    // Each PR appends one conditional block. The flag exists today; the
    // module import is added when the matching module lands.
    //
    if (config.emailOtp.enabled) imports.push(EmailOtpModule); // PR 8
    if (config.google.enabled) imports.push(GoogleAuthModule); // PR 9
    if (config.apple.enabled) imports.push(AppleAuthModule); // PR 10
    // if (config.smsOtp.enabled)   imports.push(SmsOtpModule);     // PR 11

    return {
      module: AuthModule,
      imports,
      providers,
      exports: [CoreAuthModule],
    };
  }
}
