import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FleetServiceDashboard } from "./FleetServiceDashboard";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({
  webApi: { fetch: mocks.apiFetch },
}));

beforeEach(() => mocks.apiFetch.mockReset());

describe("FleetServiceDashboard", () => {
  it("shows concrete open problems and scheduled maintenance", () => {
    renderDashboard();

    expect(
      screen.getByRole("heading", { name: "Fleet service" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Front brake pressure loss")).toBeInTheDocument();
    expect(screen.getByText("Engine oil")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Yamaha NMAX/ })).toHaveLength(
      2,
    );
    for (const link of screen.getAllByRole("link", { name: /Yamaha NMAX/ })) {
      expect(link).toHaveAttribute("href", "/en/scooters/scooter-1");
    }
  });

  it("localizes the service queues and scooter links in Romanian", () => {
    renderDashboard("ro");

    expect(screen.getByText("critică")).toBeInTheDocument();
    expect(screen.getByText("Depășită")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: /Yamaha NMAX/ })) {
      expect(link).toHaveAttribute("href", "/scooters/scooter-1");
    }
  });

  it("loads the next page of open problems", async () => {
    const nextIssues = fleetIssues();
    nextIssues.page = 2;
    nextIssues.items[0]!.issue = {
      ...nextIssues.items[0]!.issue,
      id: "issue-2",
      title: "Steering head play",
    };
    nextIssues.total = 2;
    mocks.apiFetch.mockResolvedValueOnce(nextIssues);
    const initialIssues = fleetIssues();
    initialIssues.total = 2;
    const browser = userEvent.setup();

    renderDashboard("en", initialIssues);
    await browser.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        `${v1.maintenance.ROUTES.issues.fleetList}?page=2&pageSize=25&status=OPEN`,
        v1.maintenance.fleetIssueListSchema,
        { cache: "no-store" },
      ),
    );
    expect(await screen.findByText("Steering head play")).toBeInTheDocument();
  });
});

function renderDashboard(
  locale: SupportedLocale = "en",
  initialIssues = fleetIssues(),
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <FleetServiceDashboard
        dashboard={attentionDashboard()}
        initialIssues={initialIssues}
        initialSchedule={serviceSchedule()}
      />
    </NextIntlClientProvider>,
  );
}

function fleetIssues(): v1.maintenance.FleetIssueList {
  return {
    items: [
      {
        scooter: scooterDescriptor(),
        issue: {
          id: "issue-1",
          scooterId: "scooter-1",
          title: "Front brake pressure loss",
          description: null,
          severity: "CRITICAL",
          status: "OPEN",
          reportedAt: "2026-08-01T10:00:00.000Z",
          resolvedAt: null,
          reportedByUserId: "admin-1",
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      },
    ],
    page: 1,
    pageSize: 25,
    total: 1,
  };
}

function serviceSchedule(): v1.maintenance.ServiceScheduleList {
  const maintenanceType: v1.maintenance.MaintenanceType = {
    id: "type-engine-oil",
    code: "ENGINE_OIL_CHANGE",
    name: "Engine oil",
    intervalKm: 3_000,
    intervalMonths: 6,
    isActive: true,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  };

  return {
    items: [
      {
        scooter: scooterDescriptor(),
        maintenanceType,
        status: "OVERDUE",
        latestRecord: {
          id: "record-1",
          scooterId: "scooter-1",
          maintenanceTypeId: maintenanceType.id,
          maintenanceType,
          performedAt: "2026-01-01",
          performedKm: 1_000,
          notes: null,
          nextDueAt: "2026-07-01",
          nextDueKm: 4_000,
          recordedByUserId: "admin-1",
          createdAt: "2026-01-01T10:00:00.000Z",
          updatedAt: "2026-01-01T10:00:00.000Z",
        },
      },
    ],
    page: 1,
    pageSize: 25,
    total: 1,
  };
}

function scooterDescriptor(): v1.maintenance.ServiceScooterDescriptor {
  return {
    id: "scooter-1",
    vin: "JYARN23E0RA123456",
    brand: "Yamaha",
    model: "NMAX",
    currentMileageKm: 4_200,
  };
}

function attentionDashboard(): v1.maintenance.FleetMaintenanceDashboard {
  return {
    totalScooters: 1,
    scootersWithOpenIssues: 1,
    scootersWithBlockingIssues: 1,
    scootersWithOverdueMaintenance: 1,
    scootersWithMaintenanceDueSoon: 1,
    requiresAttention: [],
  };
}
