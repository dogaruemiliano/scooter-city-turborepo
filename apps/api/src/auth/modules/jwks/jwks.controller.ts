/**
 * `GET /.well-known/jwks.json` — public JWK set for RS256 access-token
 * verification by external first-party clients.
 *
 * Lives outside the versioned `/v1/...` namespace (`VERSION_NEUTRAL`) so
 * the URL stays canonical regardless of API version.
 *
 * `@SkipThrottle()` is intentional. JWKS is hit by every first-party
 * verifier on cache miss; coordinated refreshes during key rotation are
 * legitimate, and the response is a precomputed cacheable constant.
 */
import {
  Controller,
  Get,
  Header,
  Inject,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";

import { Public } from "../../decorators/public.decorator";
import type { KeyRing } from "../../utils/keys";
import { KEY_RING } from "../../utils/keys.module";

@ApiTags("auth")
@Controller({ path: ".well-known/jwks.json", version: VERSION_NEUTRAL })
export class JwksController {
  constructor(@Inject(KEY_RING) private readonly ring: KeyRing) {}

  @Public()
  @SkipThrottle()
  @Get()
  @Header("Cache-Control", "public, max-age=3600, must-revalidate")
  @ApiOperation({
    summary: "Public JWK set for RS256 access-token verification",
    description:
      "Includes the current signing key and (during a rotation window) the previous one. Consumers should respect Cache-Control and refresh on `kid` cache miss.",
  })
  getJwks(): KeyRing["jwks"] {
    return this.ring.jwks;
  }
}
