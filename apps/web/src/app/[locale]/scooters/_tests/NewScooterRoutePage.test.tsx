import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionIdentity } from "@/lib/auth-types";
import NewScooterRoutePage from "../new/page";
import { ScooterCreateForm } from "../_components/ScooterCreateForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  meFromApi: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ webApi: { fetch: mocks.apiFetch } }));
vi.mock("@/lib/auth-server", () => ({ meFromApi: mocks.meFromApi }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("../_components/ScooterCreateForm", () => ({
  ScooterCreateForm: () => null,
}));

const identity: SessionIdentity = {
  id: "user-1",
  email: "operator@example.test",
  roles: [],
};
const brand: v1.scooterBrands.ScooterBrand = {
  id: "brand-1",
  name: "Yamaha",
  code: "YAM",
  scooterCount: 0,
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookies.mockResolvedValue({ toString: () => "access_token=session" });
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path === v1.scooterBrands.ROUTES.list) return { items: [brand] };
    if (path === v1.vehicleCiv.CIV_ROUTES.vocabulary) return [];
    throw new Error(`Unexpected API request: ${path}`);
  });
});

describe("NewScooterRoutePage authorization", () => {
  it.each([
    {
      name: "fresh super admin without legacy roles",
      user: { ...identity, isSuperAdmin: true, effectiveScopes: {} },
    },
    {
      name: "operator with an explicit scooter-create grant",
      user: {
        ...identity,
        isSuperAdmin: false,
        effectiveScopes: {
          "scooters.create": ["ALL"],
          "scooters.read": ["ALL"],
          "scooter_brands.read": ["ALL"],
          "vehicle_civ.read": ["ALL"],
        },
      },
    },
  ])("loads creation data for a $name", async ({ user }) => {
    mocks.meFromApi.mockResolvedValue(user);

    const page = await NewScooterRoutePage({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(page.type).toBe(ScooterCreateForm);
    expect(page.props).toEqual({
      scootersHref: "/en/scooters",
      brands: [brand],
      vocabulary: [],
    });
    expect(mocks.meFromApi).toHaveBeenCalledOnce();
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.scooterBrands.ROUTES.list,
      v1.scooterBrands.scooterBrandListSchema,
      { headers: { cookie: "access_token=session" }, cache: "no-store" },
    );
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.vehicleCiv.CIV_ROUTES.vocabulary,
      v1.vehicleCiv.civVocabularySchema,
      { headers: { cookie: "access_token=session" }, cache: "no-store" },
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("denies legacy SUPER_ADMIN roles without fresh capabilities before any data fetch", async () => {
    mocks.meFromApi.mockResolvedValue({
      ...identity,
      roles: ["ADMIN", "SUPER_ADMIN"],
    });

    await expect(
      NewScooterRoutePage({ params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "/en/sign-in?next=%2Fen%2Fscooters%2Fnew"],
    ["ro", "/sign-in?next=%2Fscooters%2Fnew"],
  ])(
    "redirects unauthenticated %s requests back through sign-in",
    async (locale, signInPath) => {
      mocks.meFromApi.mockResolvedValue(null);

      await expect(
        NewScooterRoutePage({ params: Promise.resolve({ locale }) }),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(signInPath);
      expect(mocks.notFound).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
      expect(mocks.apiFetch).not.toHaveBeenCalled();
    },
  );
});
