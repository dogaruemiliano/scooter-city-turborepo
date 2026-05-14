/**
 * Reusable zod fragments shared by API DTOs, web server-action inputs,
 * and mobile form validators.
 *
 * Rules baked in:
 * - `phoneSchema` is E.164 (`+` + 7..15 digits) — the canonical format for
 *   storage, SMS delivery, and OAuth profile claims.
 * - `otpCodeSchema` matches the API's production OTPs (`OTP_LENGTH`
 *   digits, default 6). In non-production environments the API emits the
 *   literal string `"000000"` (also 6 digits) — the schema accepts both.
 * - `emailSchema` caps at 254 chars (RFC 5321 limit for the full address).
 */
import { z } from "zod";

/**
 * RFC-5321-bounded email. Accepts `@privaterelay.appleid.com` because
 * Apple Sign-in private relay addresses ARE valid emails. Do NOT add a
 * domain allowlist here — that's a deployment-specific concern.
 */
export const emailSchema = z.email().max(254);

/**
 * E.164 phone number. Must start with `+` and a country code digit 1-9,
 * followed by 7-15 more digits. No spaces, dashes, or parentheses.
 */
export const phoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/, {
  message: "Phone must be in E.164 format (e.g. +40712345678).",
});

/**
 * 6-digit OTP code as a string (preserves leading zeros). Length is
 * hardcoded to 6 here because every OTP we emit — both production
 * crypto-random and non-prod dev `"000000"` — is 6 digits. If
 * `OTP_LENGTH` is ever raised, this regex must move in lockstep.
 */
export const otpCodeSchema = z.string().regex(/^\d{6}$/, {
  message: "OTP code must be exactly 6 digits.",
});
