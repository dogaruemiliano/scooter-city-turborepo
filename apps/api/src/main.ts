/**
 * API bootstrap.
 *
 * Boots a NestJS app with:
 * - Pino structured logger (replaces the default Nest logger).
 * - Request-ID middleware (already registered in [AppModule](./app.module.ts)).
 * - URI versioning, default `v1`. Every controller route lives under `/v1/...`
 *   except `/healthz` which is version-neutral.
 * - Global ValidationPipe (whitelist + transform + forbidNonWhitelisted).
 * - Global `AllExceptionsFilter` for the normalized error envelope.
 * - CORS with credentials enabled and explicit origin allowlist
 *   (`*` is incompatible with `credentials: true` per the W3C spec).
 * - `cookie-parser` so refresh/access cookies are readable.
 * - Swagger UI at `/api-docs` with a `cookieAuth` security scheme that
 *   `@ApiCookieAuth()` decorators on protected controllers reference. The
 *   JSON spec is served at `/api-docs-json`.
 * - Graceful shutdown hooks so `PrismaService.$disconnect` (later) fires.
 *
 * ## `--spec-only` mode
 *
 * When invoked as `node dist/main --spec-only`, the bootstrap builds the
 * Swagger document, writes the JSON to stdout, and exits with code 0. Used
 * by the root `pnpm gen` pipeline to feed Orval without leaving a server
 * process running.
 */
// MUST be the very first import — see file header for why.
import './spec-only-bootstrap';

import cookieParser from 'cookie-parser';
import { Logger as PinoLogger } from 'nestjs-pino';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { loadEnv } from './config/env';

const COOKIE_AUTH_NAME = 'access_token';

function buildSwaggerDocument(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('Turborepo Full Template API')
    .setDescription('REST API surface. All operations live under /v1.')
    .setVersion('1.0.0')
    .addCookieAuth(COOKIE_AUTH_NAME, {
      type: 'apiKey',
      in: 'cookie',
      name: COOKIE_AUTH_NAME,
      description: 'HTTP-only access-token cookie.',
    })
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}

async function bootstrap(): Promise<void> {
  const specOnly = process.argv.includes('--spec-only');
  const env = loadEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    cors: false, // configured below with explicit origin list
  });

  // Replace the default Nest logger with pino — every log line then carries
  // the reqId attached by RequestIdMiddleware.
  app.useLogger(app.get(PinoLogger));

  app.use(cookieParser());

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  app.enableShutdownHooks();

  const swaggerDocument = buildSwaggerDocument(app);

  if (specOnly) {
    process.stdout.write(JSON.stringify(swaggerDocument, null, 2));
    await app.close();
    process.exit(0);
  }

  SwaggerModule.setup('api-docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api-docs-json',
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(env.PORT);
  app.get(PinoLogger).log(`API listening on :${env.PORT}`, 'Bootstrap');
}

void bootstrap();
