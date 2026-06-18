import { HttpStatus } from "@nestjs/common";
import {
  formatMessage,
  type InterpolationValues,
  type MessageKey,
  type SupportedLocale,
} from "@repo/i18n";

interface LocalizeErrorMessageInput {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

const INVALID_OTP_MESSAGES = new Set([
  "Invalid or expired code",
  "The code is invalid or expired.",
  "The code has expired. Request a new one.",
]);

const SESSION_MESSAGES = new Set([
  "Invalid access token",
  "Invalid refresh token",
  "No refresh token provided",
  "Refresh token reuse detected; session revoked",
]);

export function localizeErrorMessage(
  input: LocalizeErrorMessageInput,
  locale: SupportedLocale,
): string {
  const match = matchErrorMessage(input);

  if (match === null) {
    return input.message;
  }

  return formatMessage(locale, match.key, match.values);
}

function matchErrorMessage(
  input: LocalizeErrorMessageInput,
): { key: MessageKey; values?: InterpolationValues } | null {
  if (
    input.status === HttpStatus.TOO_MANY_REQUESTS ||
    input.code === "OTP_DELIVERY_QUOTA_EXCEEDED"
  ) {
    return {
      key: "api.errors.rateLimited",
      values: { ttl: retryAfterSec(input.details) ?? 1 },
    };
  }

  if (INVALID_OTP_MESSAGES.has(input.message)) {
    return { key: "api.auth.otpInvalid" };
  }

  if (SESSION_MESSAGES.has(input.message)) {
    return { key: "api.auth.sessionExpired" };
  }

  if (
    input.status === HttpStatus.BAD_REQUEST &&
    (input.message === "Validation failed" || input.details !== undefined)
  ) {
    return { key: "api.errors.validation" };
  }

  if (input.status === HttpStatus.UNAUTHORIZED) {
    return { key: "api.errors.unauthorized" };
  }

  if (input.status === HttpStatus.FORBIDDEN) {
    return { key: "api.errors.forbidden" };
  }

  if (input.status === HttpStatus.NOT_FOUND) {
    return { key: "api.errors.notFound" };
  }

  if (input.status === HttpStatus.CONFLICT) {
    return { key: "api.errors.conflict" };
  }

  return null;
}

function retryAfterSec(details: unknown): number | null {
  if (
    details &&
    typeof details === "object" &&
    "retryAfterSec" in details &&
    typeof (details as { retryAfterSec?: unknown }).retryAfterSec === "number"
  ) {
    return Math.max(
      1,
      Math.ceil((details as { retryAfterSec: number }).retryAfterSec),
    );
  }

  return null;
}
