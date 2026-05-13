/**
 * HMAC-SHA-256 hashing for refresh tokens and OTP codes.
 *
 * Why SHA-256 HMAC instead of bcrypt:
 * - Both values being hashed are high-entropy already (refresh tokens are
 *   signed JWTs, OTPs are crypto-random digits). bcrypt's slow-by-design
 *   property exists to defend against low-entropy passwords; it adds no
 *   security here, only ~100 ms of CPU per refresh on the hot path.
 * - SHA-256 HMAC peppered with a server-side secret gives us the same
 *   "the attacker who steals the DB still can't reverse the values"
 *   guarantee without the CPU cost.
 *
 * Don't use these helpers for passwords — bcrypt stays for that.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** SHA-256 HMAC. Returns a 64-char lowercase hex string. */
function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function hashRefreshToken(token: string, secret: string): string {
  return hmac(token, secret);
}

export function hashOtp(code: string, secret: string): string {
  return hmac(code, secret);
}

/**
 * Constant-time comparison for the hex digests above. Prevents the
 * (mostly-theoretical) timing channel that would distinguish "the hash
 * matched for 30 chars then diverged" from "the hash diverged on char 1".
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
