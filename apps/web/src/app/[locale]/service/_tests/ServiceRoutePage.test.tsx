import { v1 } from "@repo/api-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ServiceRoutePage, { generateMetadata } from "../page";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  cookies: vi.fn(),
  meFromApi: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.apiFetch },
}));

vi.mock("@/lib/auth-server", () => ({
  meFromApi: mocks.meFromApi,
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.cookies.mockReset();
  mocks.meFromApi.mockReset();
  mocks.notFound.mockReset();
  mocks.redirect.mockReset();

  mocks.cookies.mockResolvedValue({ toString: () => "session=abc" });
  mocks.meFromApi.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    roles: ["ADMIN"],
  });
});

describe("ServiceRoutePage", () => {
  it("loads dashboard, open problems and scheduled maintenance in parallel", async () => {
    const dashboard = emptyDashboard();
    const issues = emptyIssues();
    const schedule = emptySchedule();
    mocks.apiFetch
      .mockResolvedValueOnce(dashboard)
      .mockResolvedValueOnce(issues)
      .mockResolvedValueOnce(schedule);

    const page = await ServiceRoutePage({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      1,
      v1.maintenance.ROUTES.dashboard,
      v1.maintenance.fleetMaintenanceDashboardSchema,
      { headers: { cookie: "session=abc" }, cache: "no-store" },
    );
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      2,
      `${v1.maintenance.ROUTES.issues.fleetList}?page=1&pageSize=25&status=OPEN`,
      v1.maintenance.fleetIssueListSchema,
      { headers: { cookie: "session=abc" }, cache: "no-store" },
    );
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(
      3,
      `${v1.maintenance.ROUTES.schedule}?page=1&pageSize=25`,
      v1.maintenance.serviceScheduleListSchema,
      { headers: { cookie: "session=abc" }, cache: "no-store" },
    );
    expect(page.props).toMatchObject({
      dashboard,
      initialIssues: issues,
      initialSchedule: schedule,
    });
  });

  it("returns localized metadata", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "ro" }) }),
    ).resolves.toEqual({ title: "Service" });
  });
});

function emptyDashboard(): v1.maintenance.FleetMaintenanceDashboard {
  return {
    totalScooters: 0,
    scootersWithOpenIssues: 0,
    scootersWithBlockingIssues: 0,
    scootersWithOverdueMaintenance: 0,
    scootersWithMaintenanceDueSoon: 0,
    requiresAttention: [],
  };
}

function emptyIssues(): v1.maintenance.FleetIssueList {
  return { items: [], page: 1, pageSize: 25, total: 0 };
}

function emptySchedule(): v1.maintenance.ServiceScheduleList {
  return { items: [], page: 1, pageSize: 25, total: 0 };
}
