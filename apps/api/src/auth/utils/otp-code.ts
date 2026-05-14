/**
 * One-time-code generator shared by every OTP method (email, SMS).
 *
 * In `NODE_ENV !== "production"` the code is always the literal
 * `"000000"`. This makes local dev + E2E tests deterministic — the
 * `SpyMailerService` / `SpySmsService` outbox content doesn't have to
 * be parsed to complete a verify step.
 *
 * In production we emit `length` crypto-random digits via `node:crypto`.
 * Generation is rejection-sampled to avoid modulo bias: we draw a fresh
 * random byte per digit and only accept bytes in the largest
 * multiple-of-10 range (`< 250`), redrawing otherwise. The expected
 * draws per digit is ~256/250 ≈ 1.024.
 *
 * The result is a string (not a number) to preserve leading zeros — a
 * code of `001234` must stay six characters.
 */
import { randomBytes } from "node:crypto";

const REJECTION_THRESHOLD = 250;

export function generateOtpCode(opts: {
  nodeEnv: string;
  length: number;
}): string {
  if (opts.nodeEnv !== "production") {
    return "0".repeat(opts.length);
  }
  let out = "";
  while (out.length < opts.length) {
    const bytes = randomBytes(opts.length - out.length);
    for (const byte of bytes) {
      if (byte < REJECTION_THRESHOLD) {
        out += (byte % 10).toString();
      }
    }
  }
  return out;
}
