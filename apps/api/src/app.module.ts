/**
 * Root module.
 *
 * Wires global concerns (config, structured logging, request IDs, health)
 * and the always-on infrastructure modules every feature module needs
 * (Prisma, Users, Mailer, SMS, Audit). Auth submodules are added in PR 5+
 * via `AuthModule.forRoot(buildAuthConfig(env))`.
 */
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { pinoConfig } from "./common/logger/pino.config";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { MailerModule } from "./mailer/mailer.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SmsModule } from "./sms/sms.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    // Global infrastructure (every feature module sees these).
    ConfigModule,
    LoggerModule.forRoot(pinoConfig(process.env.NODE_ENV ?? "development")),
    PrismaModule,
    MailerModule,
    SmsModule,
    AuditModule,

    // Internal (non-global) feature modules.
    UsersModule,

    // Public-surface modules.
    HealthModule,
    AuthModule.forRoot(),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
