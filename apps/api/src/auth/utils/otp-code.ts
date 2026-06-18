/**
 * Deterministic one-time-code derivation shared by every OTP challenge.
 *
 * In `NODE_ENV !== "production"` the code is always the literal
 * `"000000"`. This makes local dev + E2E tests deterministic — the
 * `SpyMailerService` / `SpySmsService` outbox content doesn't have to
 * be parsed to complete a verify step.
 *
 * In production, HMAC-SHA-256 expands the opaque challenge ID into a
 * deterministic byte stream. Digits are rejection-sampled to avoid modulo
 * bias. The same challenge can therefore be resent without persisting or
 * encrypting the plaintext code.
 *
 * The result is a string (not a number) to preserve leading zeros — a
 * code of `001234` must stay six characters.
 */
import { createHmac } from "node:crypto";

const REJECTION_THRESHOLD = 250;
const OTP_DERIVATION_DOMAIN = "otp-challenge-code:v1";

export function deriveOtpCode(opts: {
  challengeId: string;
  secret: string;
  nodeEnv: string;
  length: number;
}): string {
  if (opts.nodeEnv !== "production") {
    return "0".repeat(opts.length);
  }

  let out = "";
  let counter = 0;
  while (out.length < opts.length) {
    const bytes = createHmac("sha256", opts.secret)
      .update(OTP_DERIVATION_DOMAIN)
      .update("\0")
      .update(opts.challengeId)
      .update("\0")
      .update(counter.toString())
      .digest();
    counter += 1;

    for (const byte of bytes) {
      if (byte < REJECTION_THRESHOLD) {
        out += (byte % 10).toString();
        if (out.length === opts.length) break;
      }
    }
  }
  return out;
}
