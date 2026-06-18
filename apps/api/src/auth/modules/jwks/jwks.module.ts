/**
 * Exposes `GET /.well-known/jwks.json` so first-party verifiers (Next.js
 * RSCs, future microservices) can verify access JWTs locally without
 * round-tripping to the API.
 *
 * The JWKS body is precomputed inside the singleton `KeyRing` (see
 * [auth/utils/keys.ts](../../utils/keys.ts)) — current key first,
 * previous key (if `JWT_PUBLIC_KEY_PREVIOUS` is set) appended. The
 * controller just returns the constant.
 */
import { Module } from "@nestjs/common";

import { KeysModule } from "../../utils/keys.module";

import { JwksController } from "./jwks.controller";

@Module({
  imports: [KeysModule],
  controllers: [JwksController],
})
export class JwksModule {}
