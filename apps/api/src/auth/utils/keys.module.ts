/**
 * Thin DI wrapper around [`buildKeyRing`](./keys.ts).
 *
 * Exists so consumers (JwtModule.registerAsync, JwksModule, AuthModule's
 * JwtStrategy, CoreAuthService) can `inject: [KEY_RING]` instead of
 * re-deriving the ring from env. NestJS deduplicates KeysModule imports,
 * so the ring is computed exactly once even when multiple modules import it.
 */
import { Module } from "@nestjs/common";

import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";

import { buildKeyRing, type KeyRing } from "./keys";

/** DI token for the singleton `KeyRing`. */
export const KEY_RING = Symbol("KEY_RING");

@Module({
  providers: [
    {
      provide: KEY_RING,
      inject: [ENV],
      useFactory: (env: Env): KeyRing => buildKeyRing(env),
    },
  ],
  exports: [KEY_RING],
})
export class KeysModule {}
