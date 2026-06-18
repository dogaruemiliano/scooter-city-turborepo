import "server-only";

import { createRemoteJWKSet } from "jose";

import { webApi } from "./api";

/**
 * Remote JWK set used by `meOnServer()` to verify access JWTs locally
 * without round-tripping to `/v1/auth/me`. `createRemoteJWKSet` caches
 * the JWKS body internally (TTL ~10min, cooldown ~30s on cache miss),
 * so module-level instantiation is the recommended pattern.
 *
 * If the JWT's `kid` header doesn't match any cached JWK, jose triggers
 * a single cooldown-gated refetch — this is what makes API-side key
 * rotation transparent to the web app.
 */
export const JWKS = createRemoteJWKSet(
  new URL(webApi.url("/.well-known/jwks.json")),
);
