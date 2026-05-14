/**
 * Environment variable schema.
 *
 * Single source of truth for everything the API reads from the environment.
 * Every key carries `.describe(...)` so `scripts/generate-env-example.ts` can
 * emit a fully-commented `.env.example` from this file.
 *
 * Cross-field rules (each `AUTH_*_ENABLED=true` requires its provider creds;
 * `MAILER_PROVIDER=resend` requires `RESEND_API_KEY`; etc.) live in the
 * `.superRefine` block at the bottom.
 */
import { z } from "zod";

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

const boolFromString = z.union([z.boolean(), z.string()]).transform((v) => {
  if (typeof v === "boolean") return v;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
});

const csv = z.string().transform((s) =>
  s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean),
);

/* ------------------------------------------------------------------------- */
/* Schema                                                                    */
/* ------------------------------------------------------------------------- */

export const envSchema = z
  .object({
    /* App ----------------------------------------------------------------- */
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development")
      .describe(
        "Runtime mode. Controls dev-only conveniences (e.g. OTP=000000).",
      ),
    PORT: z.coerce
      .number()
      .int()
      .positive()
      .default(3000)
      .describe("Port the API listens on."),
    APP_BASE_URL: z
      .url()
      .default("http://localhost:3001")
      .describe("Public base URL of the web app (used in emails, redirects)."),
    API_BASE_URL: z
      .url()
      .default("http://localhost:3000")
      .describe("Public base URL of this API (used in OpenAPI servers list)."),
    COOKIE_DOMAIN: z
      .string()
      .optional()
      .describe(
        'Cookie domain in production (e.g. ".example.com"). Leave empty in dev — Lax cookies on localhost work without it.',
      ),
    CORS_ORIGINS: csv
      .default(["http://localhost:3001"])
      .describe(
        'Comma-separated list of allowed CORS origins. MUST be explicit when credentials are enabled (no "*").',
      ),

    /* DB ------------------------------------------------------------------ */
    DATABASE_URL: z
      .url()
      .default("postgresql://app:app@localhost:5434/app")
      .describe(
        "Postgres connection string. See docker-compose.yml for local defaults.",
      ),

    /* JWT ----------------------------------------------------------------- */
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .describe(
        "HMAC secret for access tokens. Min 32 chars. ROTATE per environment.",
      ),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32)
      .describe(
        "HMAC secret for refresh tokens. Min 32 chars. Distinct from JWT_ACCESS_SECRET.",
      ),
    JWT_ACCESS_TTL: z
      .string()
      .default("15m")
      .describe('Access-token lifetime (ms-format, e.g. "15m", "1h").'),
    JWT_REFRESH_TTL: z
      .string()
      .default("90d")
      .describe('Refresh-token lifetime (ms-format, e.g. "90d").'),
    REFRESH_TOKEN_HMAC_SECRET: z
      .string()
      .min(32)
      .describe(
        "SHA-256 HMAC pepper for refresh-token DB hashing. Distinct from JWT_REFRESH_SECRET. Min 32 chars.",
      ),
    ROTATION_GRACE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(10)
      .describe(
        "Window during which a concurrent refresh of the same token returns the literal same just-issued pair (option-B idempotency).",
      ),

    /* Method toggles ------------------------------------------------------ */
    AUTH_EMAIL_OTP_ENABLED: boolFromString
      .default(true)
      .describe("Enable email-OTP login (request/verify endpoints)."),
    AUTH_SMS_OTP_ENABLED: boolFromString
      .default(false)
      .describe("Enable SMS-OTP login. Requires SMS_PROVIDER credentials."),
    AUTH_GOOGLE_ENABLED: boolFromString
      .default(false)
      .describe(
        "Enable Google Sign-in (ID-token verification). Requires GOOGLE_CLIENT_ID_*.",
      ),
    AUTH_APPLE_ENABLED: boolFromString
      .default(false)
      .describe(
        "Enable Sign in with Apple. Requires APPLE_SERVICE_ID and/or APPLE_BUNDLE_ID as the audience.",
      ),

    /* OAuth creds --------------------------------------------------------- */
    GOOGLE_CLIENT_ID_WEB: z
      .string()
      .optional()
      .describe("Google OAuth web client ID (audience for verification)."),
    GOOGLE_CLIENT_ID_IOS: z
      .string()
      .optional()
      .describe("Google OAuth iOS client ID (audience for verification)."),
    GOOGLE_CLIENT_ID_ANDROID: z
      .string()
      .optional()
      .describe("Google OAuth Android client ID (audience for verification)."),
    APPLE_SERVICE_ID: z
      .string()
      .optional()
      .describe("Apple Service ID (web audience)."),
    APPLE_BUNDLE_ID: z
      .string()
      .optional()
      .describe("Apple iOS bundle ID (native audience)."),
    APPLE_TEAM_ID: z
      .string()
      .optional()
      .describe(
        "Apple Developer Team ID (reserved for future server-to-server token revocation).",
      ),
    APPLE_KEY_ID: z
      .string()
      .optional()
      .describe(
        "Apple Sign-in key ID (reserved for future server-to-server flows).",
      ),

    /* OTP ----------------------------------------------------------------- */
    OTP_HMAC_SECRET: z
      .string()
      .min(32)
      .describe("SHA-256 HMAC pepper for OTP-code DB hashing. Min 32 chars."),
    OTP_TTL: z
      .string()
      .default("10m")
      .describe('OTP lifetime (ms-format, e.g. "10m").'),
    OTP_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .default(5)
      .describe("Max wrong attempts before an OTP is locked."),
    OTP_LENGTH: z.coerce
      .number()
      .int()
      .min(4)
      .max(10)
      .default(6)
      .describe(
        'OTP digit length in production. In non-production NODE_ENV, OTPs are always "000000" regardless of this value.',
      ),

    /* Mailer -------------------------------------------------------------- */
    MAILER_PROVIDER: z
      .enum(["resend", "smtp", "log"])
      .default("log")
      .describe(
        'Email provider. "log" prints to stdout (dev/test). "resend" uses Resend API. "smtp" uses nodemailer.',
      ),
    MAILER_FROM: z
      .email()
      .default("no-reply@example.com")
      .describe("From address used for outgoing mail."),
    RESEND_API_KEY: z
      .string()
      .optional()
      .describe("Resend API key. Required when MAILER_PROVIDER=resend."),
    SMTP_HOST: z
      .string()
      .optional()
      .describe("SMTP host. Required when MAILER_PROVIDER=smtp."),
    SMTP_PORT: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe("SMTP port. Required when MAILER_PROVIDER=smtp."),
    SMTP_USER: z
      .string()
      .optional()
      .describe("SMTP username. Required when MAILER_PROVIDER=smtp."),
    SMTP_PASSWORD: z
      .string()
      .optional()
      .describe("SMTP password. Required when MAILER_PROVIDER=smtp."),

    /* SMS ----------------------------------------------------------------- */
    SMS_PROVIDER: z
      .enum(["smso", "log"])
      .default("log")
      .describe('SMS provider. "log" prints to stdout. "smso" uses SMSO.ro.'),
    SMSO_API_KEY: z
      .string()
      .optional()
      .describe("SMSO.ro API key. Required when SMS_PROVIDER=smso."),
    SMSO_SENDER: z
      .string()
      .optional()
      .describe("SMSO.ro sender ID. Required when SMS_PROVIDER=smso."),

    /* Throttler ----------------------------------------------------------- */
    THROTTLE_OTP_PER_IP_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(20)
      .describe("Max OTP requests per IP per hour."),
    THROTTLE_OTP_PER_TARGET_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(5)
      .describe("Max OTP requests per email/phone per hour."),
    THROTTLE_OTP_PER_TARGET_PER_DAY: z.coerce
      .number()
      .int()
      .positive()
      .default(20)
      .describe("Max OTP requests per email/phone per 24h."),
    THROTTLE_LOGIN_PER_IP_PER_MIN: z.coerce
      .number()
      .int()
      .positive()
      .default(10)
      .describe("Max login attempts per IP per minute."),

    /* Cleanup cron -------------------------------------------------------- */
    AUTH_CLEANUP_ENABLED: boolFromString
      .default(true)
      .describe(
        "Run daily 03:00 cleanup of expired refresh tokens and stale OTP rows.",
      ),
  })
  .superRefine((v, ctx) => {
    const requireIf = (cond: boolean, key: keyof typeof v, hint: string) => {
      if (cond && !v[key]) {
        ctx.addIssue({
          code: "custom",
          path: [String(key)],
          message: `${String(key)} is required when ${hint}.`,
        });
      }
    };

    // OAuth creds when the matching method is enabled
    if (v.AUTH_GOOGLE_ENABLED) {
      if (
        !v.GOOGLE_CLIENT_ID_WEB &&
        !v.GOOGLE_CLIENT_ID_IOS &&
        !v.GOOGLE_CLIENT_ID_ANDROID
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["GOOGLE_CLIENT_ID_WEB"],
          message:
            "At least one of GOOGLE_CLIENT_ID_WEB|IOS|ANDROID is required when AUTH_GOOGLE_ENABLED=true.",
        });
      }
    }
    if (v.AUTH_APPLE_ENABLED) {
      if (!v.APPLE_SERVICE_ID && !v.APPLE_BUNDLE_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["APPLE_SERVICE_ID"],
          message:
            "At least one of APPLE_SERVICE_ID or APPLE_BUNDLE_ID is required when AUTH_APPLE_ENABLED=true.",
        });
      }
    }

    // Mailer
    requireIf(
      v.MAILER_PROVIDER === "resend",
      "RESEND_API_KEY",
      "MAILER_PROVIDER=resend",
    );
    requireIf(
      v.MAILER_PROVIDER === "smtp",
      "SMTP_HOST",
      "MAILER_PROVIDER=smtp",
    );
    requireIf(
      v.MAILER_PROVIDER === "smtp",
      "SMTP_PORT",
      "MAILER_PROVIDER=smtp",
    );
    requireIf(
      v.MAILER_PROVIDER === "smtp",
      "SMTP_USER",
      "MAILER_PROVIDER=smtp",
    );
    requireIf(
      v.MAILER_PROVIDER === "smtp",
      "SMTP_PASSWORD",
      "MAILER_PROVIDER=smtp",
    );

    // SMS
    if (
      v.AUTH_SMS_OTP_ENABLED &&
      v.SMS_PROVIDER === "log" &&
      v.NODE_ENV === "production"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["SMS_PROVIDER"],
        message:
          "SMS_PROVIDER=log is not allowed in production when AUTH_SMS_OTP_ENABLED=true.",
      });
    }
    requireIf(v.SMS_PROVIDER === "smso", "SMSO_API_KEY", "SMS_PROVIDER=smso");
    requireIf(v.SMS_PROVIDER === "smso", "SMSO_SENDER", "SMS_PROVIDER=smso");
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parses `process.env` (or a custom record) into the typed `Env` object.
 * Throws a flattened ZodError if validation fails.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
