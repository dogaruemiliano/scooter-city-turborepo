/**
 * Wraps `@nestjs/config` with our zod-validated env schema.
 *
 * The schema in [./env.ts](./env.ts) is the single source of truth. This
 * module exposes the parsed, typed `Env` object via the `ENV` injection token.
 *
 * @example
 * ```ts
 * @Injectable()
 * class Foo {
 *   constructor(@Inject(ENV) private readonly env: Env) {}
 * }
 * ```
 */
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { envSchema, type Env } from './env';

export const ENV = 'ENV';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => envSchema.parse(raw),
    }),
  ],
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => envSchema.parse(process.env),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
