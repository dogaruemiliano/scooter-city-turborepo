import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScootersRoutePage from "../page";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.apiFetch } }));
vi.mock("@/lib/auth-server", () => ({
  meFromApi: async () => ({ effectiveScopes: { "scooters.read": ["ALL"] } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "test-cookie" }),
}));
vi.mock("../_components/ScootersPage", () => ({ ScootersPage: () => null }));

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.apiFetch.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
});

describe("ScootersRoutePage sorting", () => {
  it.each([
    ["vinAsc", "&sort=vinAsc"],
    ["fleetNumberAsc", ""],
  ])(
    "preserves %s consistently with the client default",
    async (sort, expectedSort) => {
      await ScootersRoutePage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({ sort }),
      });
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.scooters.ROUTES.list}?page=1&pageSize=25${expectedSort}`,
        v1.scooters.scooterListSchema,
        { headers: { cookie: "test-cookie" }, cache: "no-store" },
      );
    },
  );
});
