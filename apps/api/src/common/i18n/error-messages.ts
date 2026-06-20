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

const LOCALIZED_HTTP_STATUS = {
  badRequest: Number(HttpStatus.BAD_REQUEST),
  conflict: Number(HttpStatus.CONFLICT),
  forbidden: Number(HttpStatus.FORBIDDEN),
  notFound: Number(HttpStatus.NOT_FOUND),
  tooManyRequests: Number(HttpStatus.TOO_MANY_REQUESTS),
  unauthorized: Number(HttpStatus.UNAUTHORIZED),
} as const;

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
    input.status === LOCALIZED_HTTP_STATUS.tooManyRequests ||
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
    input.status === LOCALIZED_HTTP_STATUS.badRequest &&
    (input.message === "Validation failed" || input.details !== undefined)
  ) {
    return { key: "api.errors.validation" };
  }

  if (input.status === LOCALIZED_HTTP_STATUS.unauthorized) {
    return { key: "api.errors.unauthorized" };
  }

  if (input.status === LOCALIZED_HTTP_STATUS.forbidden) {
    return { key: "api.errors.forbidden" };
  }

  if (input.status === LOCALIZED_HTTP_STATUS.notFound) {
    return { key: "api.errors.notFound" };
  }

  if (input.status === LOCALIZED_HTTP_STATUS.conflict) {
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
