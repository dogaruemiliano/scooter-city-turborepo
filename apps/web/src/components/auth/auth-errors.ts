import { ApiError } from "@repo/api-shared";
import { formatMessage, type MessageKey } from "@repo/i18n";

export interface AuthErrorState {
  cause: unknown;
  unauthorizedMessage?: MessageKey;
}

/** Resolve copy at render time so existing errors follow language changes. */
export function formatAuthError(
  error: unknown,
  locale: string,
  unauthorizedMessage: MessageKey = "auth.errors.sessionExpired",
): string {
  if (error instanceof ApiError) {
    // Never expose backend text, including errors returned by a proxy.
    if (error.status >= 500) {
      return formatMessage(locale, "api.errors.internalServer");
    }
    if (error.status === 429 || error.code === "OTP_DELIVERY_QUOTA_EXCEEDED") {
      const details = error.details;
      const retryAfterSec =
        details && typeof details === "object" && "retryAfterSec" in details
          ? details.retryAfterSec
          : undefined;
      return typeof retryAfterSec === "number" &&
        Number.isFinite(retryAfterSec) &&
        retryAfterSec > 0
        ? formatMessage(locale, "api.errors.rateLimited", {
            ttl: Math.ceil(retryAfterSec),
          })
        : formatMessage(locale, "api.errors.rateLimitedWithoutDelay");
    }
    if (error.code === "csrf_required") {
      return formatMessage(locale, "auth.errors.csrf");
    }
    if (error.status === 401) {
      return formatMessage(locale, unauthorizedMessage);
    }
    if (error.status === 400) {
      return formatMessage(locale, "api.errors.validation");
    }
    if (error.status === 403) {
      return formatMessage(locale, "api.errors.forbidden");
    }
  }

  if (error instanceof TypeError) {
    return formatMessage(locale, "api.errors.network");
  }
  return formatMessage(locale, "api.errors.internalServer");
}
