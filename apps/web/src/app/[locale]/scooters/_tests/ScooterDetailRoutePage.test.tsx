import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateMetadata } from "../[id]/page";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cookies: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("@/lib/auth-server", () => ({
  meFromApi: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

const scooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brand: "Yamaha",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  cylinderCapacityCc: 125,
  purchasedOn: "2026-01-15",
  registrationStatus: "unregistered",
  notes: "Maker papers received",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.cookies.mockReset();
  mocks.notFound.mockReset();
  mocks.redirect.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  mocks.cookies.mockResolvedValue({ toString: () => "session=abc" });
});

describe("ScooterRoutePage metadata", () => {
  it("returns the scooter brand and model as detail metadata", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: "ro", id: "scooter-1" }),
      }),
    ).resolves.toEqual({ title: "Yamaha NMAX" });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      v1.scooters.ROUTES.get("scooter-1"),
      v1.scooters.scooterSchema,
      {
        headers: { cookie: "session=abc" },
        cache: "no-store",
      },
    );
  });
});
