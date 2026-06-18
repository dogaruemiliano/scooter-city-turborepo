/**
 * RSA keypair plumbing for RS256 access + refresh JWTs.
 *
 * Why RS256: lets first-party verifiers (Next.js RSCs, future microservices)
 * verify access tokens locally against the public JWK fetched from
 * `/.well-known/jwks.json`, without round-tripping to `/v1/auth/me`. The
 * private key never leaves this process.
 *
 * Why one keypair (not two — access vs refresh): refresh tokens are
 * server-internal (only this API ever verifies them). Splitting the keypair
 * doubles operational complexity without raising the security ceiling.
 *
 * Env-format choice: PEM is multi-line and survives shells poorly. We
 * accept base64-encoded PEM in `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` and
 * decode at consumption.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";

import type { Env } from "../../config/env";

const DEV_KEY_DIR = resolve(process.cwd(), ".dev-keys");
const DEV_PRIVATE = resolve(DEV_KEY_DIR, "jwt-private.pem");
const DEV_PUBLIC = resolve(DEV_KEY_DIR, "jwt-public.pem");

/** Decode a base64-encoded PEM blob into the raw multi-line PEM string. */
export function decodePem(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

/** Encode a raw PEM string as base64 (env-var friendly, single line). */
export function encodePem(pem: string): string {
  return Buffer.from(pem, "utf8").toString("base64");
}

/**
 * In dev/test, generate (or reuse) a 2048-bit RSA keypair on disk and
 * inject the base64-encoded PEMs into `process.env` so the env schema
 * passes. Idempotent — re-running reuses the existing pair.
 *
 * No-op in production: production must provide the keys explicitly. We
 * never auto-generate in prod because the JWKS would change on every
 * cold start, invalidating active sessions silently.
 */
export function ensureDevJwtKeypair(): void {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY) return;

  if (!existsSync(DEV_PRIVATE) || !existsSync(DEV_PUBLIC)) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    mkdirSync(dirname(DEV_PRIVATE), { recursive: true });
    writeFileSync(DEV_PRIVATE, privateKey, { mode: 0o600 });
    writeFileSync(DEV_PUBLIC, publicKey, { mode: 0o644 });
  }

  process.env.JWT_PRIVATE_KEY = encodePem(readFileSync(DEV_PRIVATE, "utf8"));
  process.env.JWT_PUBLIC_KEY = encodePem(readFileSync(DEV_PUBLIC, "utf8"));
}

/* ──────────────────────────────────────────────────────────────────────
 * KeyRing — RS256 signing + multi-key verification
 *
 * Single source of truth shared between three call sites that must agree
 * on the kid derivation (RFC 7638 thumbprint of {e, kty, n}):
 *
 *   1. JwtModule.registerAsync — signOptions.header.kid for outgoing tokens
 *   2. JwtStrategy — secretOrKeyProvider for incoming-access-token verify
 *   3. CoreAuthService.verifyRefreshJwt — incoming-refresh-token verify
 *   4. JwksModule — /.well-known/jwks.json payload
 *
 * Asymmetry between any of the four breaks verification, hence one helper.
 * ────────────────────────────────────────────────────────────────────── */

/** A public JWK with the metadata we always attach for our JWKS. */
export interface PublicJwkWithMeta extends JsonWebKey {
  use: "sig";
  alg: "RS256";
  kid: string;
}

/**
 * Loaded once at module bootstrap and immutable for the process lifetime.
 * Rotating keys requires a redeploy.
 *
 * Public keys are stored as PEM strings (not KeyObject) so the result of
 * `resolveVerifyKey` is directly assignable to both passport-jwt's
 * `secretOrKey` callback (typed `string | Buffer`) and
 * `JwtService.verify({ publicKey })` without per-call re-export.
 */
export interface KeyRing {
  /** Private key for signing newly minted tokens. */
  signingPrivate: KeyObject;
  /** kid of the signing key. Embedded in every issued JWT's header. */
  currentKid: string;
  /** Maps kid → PEM string. Contains current + (optional) previous keys. */
  byKid: ReadonlyMap<string, string>;
  /** Precomputed /.well-known/jwks.json body (current key first). */
  jwks: { keys: PublicJwkWithMeta[] };
  /**
   * Resolve the verifier key for a presented JWT by peeking at `header.kid`.
   * Returns a PEM-encoded SPKI string. Throws on missing/unknown/malformed
   * — callers should map to 401.
   */
  resolveVerifyKey(token: string): string;
}

/**
 * RFC 7638 JWK thumbprint, truncated to 16 base64url chars. The full
 * 256-bit thumbprint is 43 chars; truncation trades collision room
 * (effectively 96 bits) for header compactness. Stable across pods that
 * share the same key.
 */
export function computeKid(jwk: JsonWebKey): string {
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error(
      `computeKid: only RSA keys are supported (got kty="${jwk.kty}")`,
    );
  }
  // The canonical members for an RSA public key, in lexicographic order,
  // with no whitespace and no extra members.
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash("sha256")
    .update(canonical)
    .digest("base64url")
    .slice(0, 16);
}

/** Build a JWK with our standard metadata (use, alg, kid) from a PEM. */
export function pemToPublicJwk(pem: string): PublicJwkWithMeta {
  const baseJwk = createPublicKey(pem).export({ format: "jwk" });
  return { ...baseJwk, use: "sig", alg: "RS256", kid: computeKid(baseJwk) };
}

/**
 * Bootstrap the KeyRing from env. Called exactly once per process by the
 * KeysModule provider factory; the returned object is frozen-in-time for
 * the process lifetime.
 */
export function buildKeyRing(env: Env): KeyRing {
  const currentPem = decodePem(env.JWT_PUBLIC_KEY);
  const currentJwk = pemToPublicJwk(currentPem);
  const signingPrivate = createPrivateKey(decodePem(env.JWT_PRIVATE_KEY));
  const signingPublicDer = createPublicKey(signingPrivate).export({
    type: "spki",
    format: "der",
  });
  const configuredPublicDer = createPublicKey(currentPem).export({
    type: "spki",
    format: "der",
  });
  if (!signingPublicDer.equals(configuredPublicDer)) {
    throw new Error("JWT_PRIVATE_KEY does not match JWT_PUBLIC_KEY.");
  }

  const previousJwks: PublicJwkWithMeta[] = [];
  const byKid = new Map<string, string>();
  byKid.set(currentJwk.kid, currentPem);

  if (env.JWT_PUBLIC_KEY_PREVIOUS) {
    const prevPem = decodePem(env.JWT_PUBLIC_KEY_PREVIOUS);
    const prevJwk = pemToPublicJwk(prevPem);
    if (prevJwk.kid === currentJwk.kid) {
      throw new Error(
        "JWT_PUBLIC_KEY_PREVIOUS has the same kid as JWT_PUBLIC_KEY — they must be distinct keys.",
      );
    }
    byKid.set(prevJwk.kid, prevPem);
    previousJwks.push(prevJwk);
  }

  return {
    signingPrivate,
    currentKid: currentJwk.kid,
    byKid,
    jwks: { keys: [currentJwk, ...previousJwks] },
    resolveVerifyKey(token) {
      const dot = token.indexOf(".");
      if (dot < 1) throw new Error("malformed JWT");
      let header: unknown;
      try {
        header = JSON.parse(
          Buffer.from(token.slice(0, dot), "base64url").toString("utf8"),
        ) as unknown;
      } catch {
        throw new Error("malformed JWT header");
      }
      if (
        typeof header !== "object" ||
        header === null ||
        Array.isArray(header)
      ) {
        throw new Error("malformed JWT header");
      }
      const kid = "kid" in header ? header.kid : undefined;
      if (typeof kid !== "string" || kid.length === 0) {
        throw new Error("missing kid");
      }
      const pem = byKid.get(kid);
      if (!pem) throw new Error("unknown kid");
      return pem;
    },
  };
}
