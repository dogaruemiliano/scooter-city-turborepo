/**
 * Root module.
 *
 * Wires global concerns (config, structured logging, request IDs, health)
 * and the always-on infrastructure modules every feature module needs
 * (Prisma, Users, Mailer, SMS, Audit). Auth submodules are added in PR 5+
 * via `AuthModule.forRoot(buildAuthConfig(env))`.
 */
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { AuditModule } from "./audit/audit.module";
import { buildAuthConfig } from "./auth/auth.config";
import { AuthModule } from "./auth/auth.module";
import { pinoConfig } from "./common/logger/pino.config";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { ConfigModule } from "./config/config.module";
import { loadEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { MailerModule } from "./mailer/mailer.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SmsModule } from "./sms/sms.module";
import { UsersModule } from "./users/users.module";

// Loaded once at module-graph build time so both `AuthModule.forRoot`
// and `MailerModule.forRoot` get the same validated `Env` instance.
const env = loadEnv();

@Module({
  imports: [
    // Global infrastructure (every feature module sees these).
    ConfigModule,
    LoggerModule.forRoot(pinoConfig(process.env.NODE_ENV ?? "development")),
    PrismaModule,
    MailerModule.forRoot(env),
    SmsModule,
    AuditModule,

    // Internal (non-global) feature modules.
    UsersModule,

    // Public-surface modules.
    HealthModule,
    AuthModule.forRoot(buildAuthConfig(env)),
  ],
  providers: [
    // Global request-body validation. Every `@Body() dto: SomeDto` where
    // `SomeDto extends createZodDto(schema)` is validated by this pipe.
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    // Global response serialization. No-op unless a controller method is
    // decorated with `@ZodSerializerDto(...)` / `@ZodResponse({ type })`.
    // Strips unknown fields from responses so an accidental DB-row leak
    // can't escape the API surface.
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
