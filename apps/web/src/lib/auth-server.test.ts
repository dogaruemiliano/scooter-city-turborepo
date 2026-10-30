import { ApiError, v1 } from "@repo/api-shared";
import { beforeEach, expect, it, vi } from "vitest";
import { meFromApi } from "./auth-server";

const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  fetch: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      mocks.cookies.has(key) ? { value: mocks.cookies.get(key) } : undefined,
    toString: () =>
      [...mocks.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
  }),
}));
vi.mock("./api", () => ({ webApi: { fetch: mocks.fetch } }));
vi.mock("./jwks", () => ({ JWKS: vi.fn() }));
beforeEach(() => {
  mocks.cookies.clear();
  mocks.fetch.mockReset();
});

it("does not query account authentication for locale or restricted guest cookies", async () => {
  mocks.cookies.set("locale", "ro");
  mocks.cookies.set("scooter_signing", "restricted-session");
  expect(await meFromApi()).toBeNull();
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("still queries the authoritative account state when an account cookie exists", async () => {
  mocks.cookies.set(v1.auth.ACCESS_TOKEN_COOKIE, "account-access");
  const user = { id: "staff" };
  mocks.fetch.mockResolvedValue(user);
  expect(await meFromApi()).toBe(user);
  expect(mocks.fetch).toHaveBeenCalledWith(
    v1.auth.ROUTES.me,
    v1.auth.sessionUserSchema,
    {
      headers: { cookie: `${v1.auth.ACCESS_TOKEN_COOKIE}=account-access` },
      cache: "no-store",
    },
  );
});

it("preserves invalid-session handling", async () => {
  mocks.cookies.set(v1.auth.ACCESS_TOKEN_COOKIE, "expired");
  mocks.fetch.mockRejectedValue(new ApiError(401, "Expired"));
  expect(await meFromApi()).toBeNull();
});
