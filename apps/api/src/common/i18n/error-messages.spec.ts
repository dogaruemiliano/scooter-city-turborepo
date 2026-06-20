import { HttpStatus } from "@nestjs/common";

import { localizeErrorMessage } from "./error-messages";

describe("localizeErrorMessage", () => {
  it("localizes validation failures", () => {
    expect(
      localizeErrorMessage(
        {
          status: HttpStatus.BAD_REQUEST,
          code: "BAD_REQUEST",
          message: "Validation failed",
        },
        "ro",
      ),
    ).toBe("Cererea conține date invalide.");
  });

  it("localizes invalid OTP without changing the code", () => {
    expect(
      localizeErrorMessage(
        {
          status: HttpStatus.UNAUTHORIZED,
          code: "UNAUTHORIZED",
          message: "Invalid or expired code",
        },
        "ro",
      ),
    ).toBe("Codul este invalid sau a expirat.");
  });

  it("localizes invalid sessions and refresh tokens", () => {
    expect(
      localizeErrorMessage(
        {
          status: HttpStatus.UNAUTHORIZED,
          code: "UNAUTHORIZED",
          message: "Invalid refresh token",
        },
        "ro",
      ),
    ).toBe("Sesiunea a expirat. Autentifică-te din nou.");
  });

  it("localizes known HTTP statuses", () => {
    expect(
      localizeErrorMessage(
        {
          status: HttpStatus.FORBIDDEN,
          code: "FORBIDDEN",
          message: "Forbidden",
        },
        "ro",
      ),
    ).toBe("Această acțiune nu este permisă.");

    expect(
      localizeErrorMessage(
        {
          status: HttpStatus.CONFLICT,
          code: "CONFLICT",
          message: "Conflict",
        },
        "ro",
      ),
    ).toBe("Cererea intră în conflict cu starea curentă a resursei.");
  });

  it("localizes rate limits with Retry-After details", () => {
    expect(
      localizeErrorMessage(
        {
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: "OTP_DELIVERY_QUOTA_EXCEEDED",
          message: "Too many code requests. Try again later.",
          details: { retryAfterSec: 42.2 },
        },
        "en",
      ),
    ).toBe("Too many requests. Try again in 43 seconds.");
  });

  it("leaves unknown bad request messages unchanged", () => {
    expect(
      localizeErrorMessage(
        {
          status: HttpStatus.BAD_REQUEST,
          code: "BAD_REQUEST",
          message: "Unknown OAuth provider",
        },
        "ro",
      ),
    ).toBe("Unknown OAuth provider");
  });
});
