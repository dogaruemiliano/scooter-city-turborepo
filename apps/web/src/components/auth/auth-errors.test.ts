import { ApiError } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { describe, expect, it } from "vitest";

import { formatAuthError } from "./auth-errors";

describe.each(["ro", "en"] as const)("auth errors in %s", (locale) => {
  const copy = messages[locale];

  it.each([500, 502, 503, 504])("hides backend text for HTTP %s", (status) => {
    expect(
      formatAuthError(new ApiError(status, "Internal server error"), locale),
    ).toBe(copy.api.errors.internalServer);
  });

  it.each([
    new Error("SMTP credentials rejected"),
    new ApiError(418, "Unexpected backend detail", "UNKNOWN_CODE"),
    new ApiError(0, "Failed to fetch"),
    null,
    undefined,
  ])("uses safe copy for unknown failures (%s)", (error) => {
    expect(formatAuthError(error, locale)).toBe(copy.api.errors.internalServer);
  });

  it("localizes network failures", () => {
    expect(formatAuthError(new TypeError("Failed to fetch"), locale)).toBe(
      copy.api.errors.network,
    );
  });

  it("preserves context for invalid OTPs and expired sessions", () => {
    const error = new ApiError(401, "Unauthorized", "UNAUTHORIZED");
    expect(
      formatAuthError(error, locale, "auth.otp.errors.invalidOrExpired"),
    ).toBe(copy.auth.otp.errors.invalidOrExpired);
    expect(formatAuthError(error, locale)).toBe(
      copy.auth.errors.sessionExpired,
    );
    expect(formatAuthError(error, locale, "auth.google.failed")).toBe(
      copy.auth.google.failed,
    );
  });

  it("localizes validation and forbidden errors", () => {
    expect(formatAuthError(new ApiError(400, "Bad Request"), locale)).toBe(
      copy.api.errors.validation,
    );
    expect(formatAuthError(new ApiError(403, "Forbidden"), locale)).toBe(
      copy.api.errors.forbidden,
    );
    expect(
      formatAuthError(
        new ApiError(403, "CSRF required", "csrf_required"),
        locale,
      ),
    ).toBe(copy.auth.errors.csrf);
  });

  it("preserves a rate limit's retry delay", () => {
    expect(
      formatAuthError(
        new ApiError(429, "Too many requests", "OTP_DELIVERY_QUOTA_EXCEEDED", {
          retryAfterSec: 42.2,
        }),
        locale,
      ),
    ).toBe(copy.api.errors.rateLimited.replace("{ttl}", "43"));
  });

  it.each([undefined, 0, -1, NaN, Infinity, "42"])(
    "does not invent a retry delay when it is invalid (%s)",
    (retryAfterSec) => {
      expect(
        formatAuthError(
          new ApiError(429, "Too many requests", undefined, { retryAfterSec }),
          locale,
        ),
      ).toBe(copy.api.errors.rateLimitedWithoutDelay);
    },
  );
});
