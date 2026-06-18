/**
 * Passport JWT strategy used by the global `JwtAuthGuard`.
 *
 * Token extraction: cookie first (`access_token`), then
 * `Authorization: Bearer …` for non-browser clients.
 *
 * The `validate(payload)` return becomes `req.user` — see
 * [auth.types.ts](../auth.types.ts) for the `AuthPrincipal` shape.
 */
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";

import type { AuthPrincipal, JwtPayload } from "../auth.types";
import { accessTokenExtractor } from "../utils/jwt-extractors";
import type { KeyRing } from "../utils/keys";
import { KEY_RING } from "../utils/keys.module";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(@Inject(KEY_RING) ring: KeyRing) {
    super({
      jwtFromRequest: accessTokenExtractor,
      ignoreExpiration: false,
      // Pin RS256 explicitly to close any alg-confusion attack surface.
      algorithms: ["RS256"],
      // Multi-key verification: look at the JWT's `header.kid` and pick
      // the matching public key from the ring. Fails loudly (no silent
      // fall-through to a default) on unknown/missing kid.
      secretOrKeyProvider: (_req, rawToken, done) => {
        try {
          if (typeof rawToken !== "string") {
            throw new Error("malformed JWT");
          }
          done(null, ring.resolveVerifyKey(rawToken));
        } catch (err) {
          done(
            err instanceof Error ? err : new Error("kid resolution failed"),
            undefined,
          );
        }
      },
    });
  }

  validate(payload: JwtPayload): AuthPrincipal {
    if (
      payload.tokenType !== "access" ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.sid !== "string" ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => typeof role === "string")
    ) {
      throw new UnauthorizedException("Invalid access token");
    }

    return {
      id: payload.sub,
      email: payload.email,
      sessionId: payload.sid,
      roles: payload.roles,
    };
  }
}
