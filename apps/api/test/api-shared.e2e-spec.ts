/**
 * Smoke test: the API can import `@repo/api-shared` and the exported
 * symbols resolve. This is intentionally tiny — it does NOT re-test the
 * zod fragments themselves (that would be testing zod). It only proves
 * the workspace wiring works end-to-end.
 *
 * If a future build setting (e.g. tsconfig "moduleResolution", or pnpm
 * hoist policy) breaks workspace package resolution, this test catches
 * it before the real auth modules try to import from the package.
 */
import { v1 } from "@repo/api-shared";

describe("@repo/api-shared (workspace wiring)", () => {
  it("exposes the cookie name constants", () => {
    expect(v1.auth.ACCESS_TOKEN_COOKIE).toBe("access_token");
    expect(v1.auth.REFRESH_TOKEN_COOKIE).toBe("refresh_token");
  });

  it("exposes ROUTES with /v1 prefixes", () => {
    expect(v1.auth.ROUTES.me).toBe("/v1/auth/me");
    expect(v1.auth.ROUTES.emailOtp.verify).toBe("/v1/auth/email-otp/verify");
    expect(v1.auth.ROUTES.sessions.revoke("abc")).toBe("/v1/auth/sessions/abc");
    expect(v1.auth.ROUTES.accounts.unlink("google")).toBe(
      "/v1/auth/accounts/google",
    );
  });

  it("exposes zod fragments as parsers", () => {
    // We don't re-test zod; we just confirm the exports are usable schemas.
    expect(v1.common.emailSchema.safeParse("a@b.co").success).toBe(true);
    expect(v1.common.phoneSchema.safeParse("+40712345678").success).toBe(true);
    expect(v1.common.otpCodeSchema.safeParse("000000").success).toBe(true);
  });
});
