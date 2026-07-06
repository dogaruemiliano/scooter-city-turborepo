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
 * - Normalized input schemas trim and canonicalize values before piping
 *   into their structural validators.
 */
import { z } from "zod";

/** Response validator for successful HTTP 204/205 operations. */
export const noContentSchema = z.undefined();

/**
 * RFC-5321-bounded email. Accepts `@privaterelay.appleid.com` because
 * Apple Sign-in private relay addresses ARE valid emails. Do NOT add a
 * domain allowlist here — that's a deployment-specific concern.
 */
export const emailSchema = z.email().max(254);

/** Lowercase + trimmed inbound email. */
export const normalizedEmailSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(emailSchema);

/**
 * E.164 phone number. Must start with `+` and a country code digit 1-9,
 * followed by 7-15 more digits. No spaces, dashes, or parentheses.
 */
export const phoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/, {
  message: "Phone must be in E.164 format (e.g. +40712345678).",
});

/** Trimmed inbound E.164 phone number. */
export const normalizedPhoneSchema = z.string().trim().pipe(phoneSchema);

/** ISO 3166-1 alpha-2 country code, uppercased on input. */
export const countryCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z.string().regex(/^[A-Z]{2}$/, {
      message: "Country code must be an ISO 3166-1 alpha-2 code.",
    }),
  );

/** Calendar date string without time or timezone. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Date must use YYYY-MM-DD format.",
  })
  .refine(isValidDateOnly, {
    message: "Date must be a valid calendar date.",
  });

/** Coerces common query-string boolean values. */
export const queryBooleanSchema = z.preprocess((value) => {
  if (value === undefined || typeof value === "boolean") return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return value;
}, z.boolean());

/**
 * 6-digit OTP code as a string (preserves leading zeros). Length is
 * hardcoded to 6 here because every OTP we emit — both production
 * crypto-random and non-prod dev `"000000"` — is 6 digits. If
 * `OTP_LENGTH` is ever raised, this regex must move in lockstep.
 */
export const otpCodeSchema = z.string().regex(/^\d{6}$/, {
  message: "OTP code must be exactly 6 digits.",
});

export function requiredTrimmedStringSchema(maxLength: number) {
  return z.string().trim().min(1).max(maxLength);
}

export function nullableTrimmedStringSchema(maxLength: number) {
  return requiredTrimmedStringSchema(maxLength).nullable();
}

export function optionalSearchStringSchema(maxLength: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    requiredTrimmedStringSchema(maxLength).optional(),
  );
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
