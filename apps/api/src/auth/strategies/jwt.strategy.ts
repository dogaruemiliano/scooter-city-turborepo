/**
 * Passport JWT strategy used by the global `JwtAuthGuard`.
 *
 * Token extraction: cookie first (`access_token`), then
 * `Authorization: Bearer …` for non-browser clients.
 *
 * The `validate(payload)` return becomes `req.user` — see
 * [auth.types.ts](../auth.types.ts) for the `AuthPrincipal` shape.
 */
import { Inject, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";

import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import type { AuthPrincipal, JwtPayload } from "../auth.types";
import { accessTokenExtractor } from "../utils/jwt-extractors";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(@Inject(ENV) env: Env) {
    super({
      jwtFromRequest: accessTokenExtractor,
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  validate(payload: JwtPayload): AuthPrincipal {
    return {
      id: payload.sub,
      email: payload.email,
      sessionId: payload.sid,
    };
  }
}
