/**
 * Root module.
 *
 * Wires global concerns (config, structured logging, request IDs, health).
 * Feature modules (auth, users, etc.) are added in subsequent PRs via
 * `AuthModule.forRoot(buildAuthConfig(env))`.
 */
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { pinoConfig } from "./common/logger/pino.config";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot(pinoConfig(process.env.NODE_ENV ?? "development")),
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
