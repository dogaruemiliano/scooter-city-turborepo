/**
 * The auth subsystem root module.
 *
 * `forRoot(config)` is a `DynamicModule` factory so per-method modules
 * (email-OTP and OAuth) can be conditionally added based on the
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
 * `CoreAuthModule` owns the configured `JwtModule` because it is the
 * module that injects `JwtService`. Importing a configured JwtModule only
 * in this parent module would not make those options visible inside a
 * child module's separately imported JwtModule.
 *
 * Auth-method IDs, env mappings, and module classes are centralized in
 * `auth-method.registry.ts`.
 */
import { DynamicModule, Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PassportModule } from "@nestjs/passport";
import { ScheduleModule } from "@nestjs/schedule";
import { v1 } from "@repo/api-shared";

import type { AuthModuleConfig } from "./auth.config";
import {
  AUTH_ENABLED_METHODS,
  resolveEnabledAuthMethodModules,
} from "./auth-method.registry";
import { AuthCleanupService } from "./cleanup/auth-cleanup.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthMethodsController } from "./modules/core-auth/auth-methods.controller";
import { CoreAuthModule } from "./modules/core-auth/core-auth.module";
import { JwksModule } from "./modules/jwks/jwks.module";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { AuthThrottlingModule } from "./throttling/auth-throttling.module";
import { KeysModule } from "./utils/keys.module";

@Module({})
export class AuthModule {
  /**
   * Build the auth module graph. The shape of `imports` and `providers`
   * varies with the supplied config — disabled features contribute
   * nothing to the graph (their providers aren't constructed, their
   * dependencies aren't required).
   */
  static forRoot(config: AuthModuleConfig): DynamicModule {
    const enabledMethods = Object.freeze(
      v1.auth.AUTH_METHOD_IDS.filter((method) =>
        config.enabledMethods.includes(method),
      ),
    );
    const imports: DynamicModule["imports"] = [
      PassportModule.register({ defaultStrategy: "jwt" }),
      // KeysModule provides the singleton KEY_RING used by sign, verify,
      // and the JWKS endpoint — see auth/utils/keys.ts for the rationale.
      KeysModule,
      AuthThrottlingModule,
      CoreAuthModule,
      JwksModule,
      ...resolveEnabledAuthMethodModules(enabledMethods),
    ];

    const providers: Provider[] = [
      {
        provide: AUTH_ENABLED_METHODS,
        useValue: enabledMethods,
      },
      JwtStrategy,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
    ];

    // ─── Cleanup cron ──────────────────────────────────────────────
    // Independent of the method modules; just needs Schedule + Prisma.
    if (config.cleanup.enabled) {
      imports.push(ScheduleModule.forRoot());
      providers.push(AuthCleanupService);
    }

    return {
      module: AuthModule,
      imports,
      controllers: [AuthMethodsController],
      providers,
      exports: [CoreAuthModule],
    };
  }
}
