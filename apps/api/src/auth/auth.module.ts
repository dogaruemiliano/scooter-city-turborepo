/**
 * The auth subsystem root module.
 *
 * `forRoot()` is a `DynamicModule` factory so the next PRs (8+) can
 * extend it: each auth-method module (email-OTP, credentials, OAuth,
 * SMS-OTP) is added to the `imports` array conditionally based on the
 * env-driven `AUTH_*_ENABLED` flags. In PR 5 only the always-on bits
 * (CoreAuth, JWT, Throttler, global guards) are wired.
 *
 * The dynamic-imports pattern means disabled methods don't just hide:
 * their routes don't exist (404), their providers aren't registered,
 * and their env vars aren't required.
 *
 * `JwtModule` is registered once here at the root. Sibling submodules
 * that need `JwtService` (CoreAuthModule, and future method modules
 * that mint or verify JWTs directly) re-import `JwtModule` from their
 * own `@Module` decorator — Nest deduplicates the registration. Not
 * global on purpose: only the auth subsystem consumes JwtService.
 */
import { DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CoreAuthModule } from "./modules/core-auth/core-auth.module";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { buildThrottlerOptions } from "./throttler.config";

@Module({})
export class AuthModule {
  /**
   * Build the auth module graph. Conditional auth-method modules will
   * be appended here as they ship (PR 8 email-OTP, PR 9 credentials,
   * PR 10-12 OAuth, PR 13 SMS-OTP).
   */
  static forRoot(): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        PassportModule.register({ defaultStrategy: "jwt" }),
        JwtModule.register({}),
        ThrottlerModule.forRootAsync({
          inject: [ENV],
          useFactory: (env: Env) => ({
            throttlers: buildThrottlerOptions(env),
          }),
        }),
        CoreAuthModule,
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
      exports: [CoreAuthModule],
    };
  }
}
