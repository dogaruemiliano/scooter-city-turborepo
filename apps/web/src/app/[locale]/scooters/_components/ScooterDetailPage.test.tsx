import { v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterDetailPage } from "./ScooterDetailPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
    push: mocks.push,
  }),
}));

const scooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brandId: "brand-yamaha",
  brand: "Yamaha",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  engineType: null,
  engineCc: 125,
  powerKw: 8.5,
  purchasedOn: "2026-01-15",
  purchasePrice: "1500.00",
  purchaseCurrency: "RON",
  registrationType: "unregistered",
  plateNumber: null,
  registeredOn: null,
  registrationExpiresOn: null,
  requiredDriverLicenseType: "none",
  currentMileageKm: 1_200,
  notes: "Maker papers received",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T11:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("ScooterDetailPage", () => {
  it("renders scooter details and actions", () => {
    renderDetail();

    expect(
      screen.getByRole("heading", { name: "Yamaha NMAX" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("JYARN23E0RA123456")[0]).toBeInTheDocument();
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getAllByText("125 cc")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Unregistered")[0]).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add registration" }),
    ).not.toBeInTheDocument();
    const moreActionsButton = screen.getByRole("button", {
      name: "More actions",
    });
    expect(moreActionsButton).toBeInTheDocument();
    expect(moreActionsButton).toHaveTextContent("");
    expect(moreActionsButton).not.toHaveClass("border-border");
    expect(moreActionsButton.querySelector("svg")).toHaveClass(
      "lucide-ellipsis-vertical",
    );
    expect(moreActionsButton.parentElement).toContainElement(
      screen.getByRole("heading", { name: "Yamaha NMAX" }),
    );
    expect(
      screen.getByRole("heading", { name: "Maintenance and repairs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,200 km")).toBeInTheDocument();
  });

  it("shows a status badge only for deleted scooters", () => {
    renderDetail("en", { ...scooter, deletedAt: "2026-08-03T12:00:00.000Z" });

    expect(
      screen
        .getAllByText("Deleted")
        .some((element) => element.dataset.slot === "badge"),
    ).toBe(true);
  });

  it("reports an issue through the strict shared contract", async () => {
    mocks.apiFetch.mockResolvedValueOnce({});
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "Add issue" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Report an issue",
    });
    await browser.type(
      within(dialog).getByLabelText("Issue title"),
      "Front brake rubbing",
    );
    await browser.type(
      within(dialog).getByLabelText("Description"),
      "Noise under light braking",
    );
    await browser.click(
      within(dialog).getByRole("button", { name: "Add issue" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.maintenance.ROUTES.issues.create(scooter.id),
        v1.maintenance.scooterIssueSchema,
        {
          method: "POST",
          json: {
            title: "Front brake rubbing",
            description: "Noise under light braking",
            severity: "MEDIUM",
          },
        },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows issue API failures inside the open dialog and keeps its fields", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("Workshop API unavailable"));
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "Add issue" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Report an issue",
    });
    const titleInput = within(dialog).getByLabelText("Issue title");
    await browser.type(titleInput, "Front brake rubbing");
    await browser.click(
      within(dialog).getByRole("button", { name: "Add issue" }),
    );

    expect(await within(dialog).findByText("Issue not saved")).toBeVisible();
    expect(within(dialog).getByText("Workshop API unavailable")).toBeVisible();
    expect(titleInput).toHaveValue("Front brake rubbing");
  });

  it("records maintenance while leaving calculated deadlines to the API", async () => {
    mocks.apiFetch.mockResolvedValueOnce({});
    const browser = userEvent.setup();
    const type = maintenanceType();

    renderDetail("en", scooter, maintenanceOverview(), [type]);
    await browser.click(
      screen.getByRole("button", { name: "Add maintenance" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Add maintenance",
    });
    expect(dialog.querySelector('[data-slot="bottom-sheet-body"]')).toHaveClass(
      "overflow-y-auto",
    );
    await replaceDateParts(browser, dialog, "Performed on", "2026-07-10");
    const mileage = within(dialog).getByLabelText("Mileage when performed");
    await browser.clear(mileage);
    await browser.type(mileage, "1250");
    await browser.click(
      within(dialog).getByRole("button", { name: "Add maintenance" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.maintenance.ROUTES.records.create(scooter.id),
        v1.maintenance.maintenanceRecordSchema,
        {
          method: "POST",
          json: {
            maintenanceTypeId: type.id,
            performedAt: "2026-07-10",
            performedKm: 1_250,
          },
        },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("submits manual maintenance deadlines when provided", async () => {
    mocks.apiFetch.mockResolvedValueOnce({});
    const browser = userEvent.setup();
    const type = maintenanceType();

    renderDetail("en", scooter, maintenanceOverview(), [type]);
    await browser.click(
      screen.getByRole("button", { name: "Add maintenance" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Add maintenance",
    });
    await replaceDateParts(browser, dialog, "Performed on", "2026-07-10");
    const mileage = within(dialog).getByLabelText("Mileage when performed");
    await browser.clear(mileage);
    await browser.type(mileage, "1250");
    await browser.type(
      within(dialog).getByLabelText("Manual next due mileage"),
      "4250",
    );
    await replaceDateParts(
      browser,
      dialog,
      "Manual next due date",
      "2027-01-10",
    );
    await browser.click(
      within(dialog).getByRole("button", { name: "Add maintenance" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.maintenance.ROUTES.records.create(scooter.id),
        v1.maintenance.maintenanceRecordSchema,
        expect.objectContaining({
          json: expect.objectContaining({
            nextDueKm: 4_250,
            nextDueAt: "2027-01-10",
          }),
        }),
      ),
    );
  });

  it("shows maintenance API failures inside the open dialog and keeps its fields", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new Error("Maintenance API unavailable"),
    );
    const browser = userEvent.setup();
    const type = maintenanceType();

    renderDetail("en", scooter, maintenanceOverview(), [type]);
    await browser.click(
      screen.getByRole("button", { name: "Add maintenance" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Add maintenance",
    });
    const mileage = within(dialog).getByLabelText("Mileage when performed");
    await browser.clear(mileage);
    await browser.type(mileage, "1300");
    await browser.click(
      within(dialog).getByRole("button", { name: "Add maintenance" }),
    );

    expect(
      await within(dialog).findByText("Maintenance not saved"),
    ).toBeVisible();
    expect(
      within(dialog).getByText("Maintenance API unavailable"),
    ).toBeVisible();
    expect(mileage).toHaveValue(1_300);
  });

  it("resets maintenance form defaults when reopened", async () => {
    const browser = userEvent.setup();
    const type = maintenanceType();

    renderDetail("en", scooter, maintenanceOverview(), [type]);
    await browser.click(
      screen.getByRole("button", { name: "Add maintenance" }),
    );
    let dialog = await screen.findByRole("dialog", { name: "Add maintenance" });
    const mileage = within(dialog).getByLabelText("Mileage when performed");
    await browser.clear(mileage);
    await browser.type(mileage, "9999");
    await browser.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await browser.click(
      screen.getByRole("button", { name: "Add maintenance" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Add maintenance" });
    expect(within(dialog).getByLabelText("Mileage when performed")).toHaveValue(
      1_200,
    );
  });

  it("shows both deadline dimensions and date-only maintenance activity", () => {
    const type = maintenanceType();
    const record = maintenanceRecord(type);
    const status: v1.maintenance.MaintenanceTypeStatus = {
      maintenanceType: type,
      latestRecord: record,
      status: "OVERDUE",
    };

    renderDetail(
      "en",
      scooter,
      maintenanceOverview({
        maintenanceStatuses: [status],
        overdueMaintenance: [status],
        activity: [
          {
            kind: "ISSUE_REPORTED",
            occurredAt: "2026-07-12T09:00:00.000Z",
            title: "Brake lever loose",
            severity: "HIGH",
            issueId: "issue-1",
            maintenanceRecordId: null,
            performedKm: null,
          },
          {
            kind: "ISSUE_FIXED",
            occurredAt: "2026-07-11T09:00:00.000Z",
            title: "Brake lever loose",
            severity: "HIGH",
            issueId: "issue-1",
            maintenanceRecordId: null,
            performedKm: null,
          },
          {
            kind: "MAINTENANCE_COMPLETED",
            occurredAt: "2026-07-10T00:00:00.000Z",
            title: type.name,
            issueId: null,
            maintenanceRecordId: record.id,
            performedKm: record.performedKm,
          },
        ],
      }),
      [type],
    );

    expect(screen.getByText("Mileage: 4,250 km")).toBeInTheDocument();
    expect(screen.getByText("Date: Jan 10, 2027")).toBeInTheDocument();
    const activityTitle = screen.getByText(
      "Maintenance completed: Engine oil change",
    );
    const activityItem = activityTitle.closest("li");
    expect(activityItem).not.toBeNull();
    expect(within(activityItem!).getByText(/Jul 10, 2026/)).toBeInTheDocument();
    expect(within(activityItem!).queryByText(/12:00/)).not.toBeInTheDocument();

    const reportedItem = screen
      .getByText("Issue reported: Brake lever loose")
      .closest("li");
    const fixedItem = screen
      .getByText("Issue fixed: Brake lever loose")
      .closest("li");
    expect(
      reportedItem?.querySelector(
        '[data-activity-kind="ISSUE_REPORTED"][data-variant="destructive"]',
      ),
    ).not.toBeNull();
    expect(
      fixedItem?.querySelector(
        '[data-activity-kind="ISSUE_FIXED"][data-variant="secondary"]',
      ),
    ).not.toBeNull();
    expect(
      activityItem?.querySelector(
        '[data-activity-kind="MAINTENANCE_COMPLETED"][data-variant="outline"]',
      ),
    ).not.toBeNull();
  });

  it("marks an open issue as fixed", async () => {
    mocks.apiFetch.mockResolvedValueOnce({});
    const browser = userEvent.setup();
    const issue = scooterIssue();

    renderDetail("en", scooter, maintenanceOverview({ openIssues: [issue] }));
    await browser.click(
      screen.getByRole("button", { name: "Mark Brake lever loose fixed" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.maintenance.ROUTES.issues.fix(scooter.id, issue.id),
        v1.maintenance.scooterIssueSchema,
        { method: "POST", json: {} },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("adds scooter registration from the focused dialog", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...scooter,
      registrationType: "national",
      plateNumber: "CJ 12 ABC",
      registeredOn: "2026-01-16",
      requiredDriverLicenseType: "A1",
    });
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Add registration"));
    const dialog = await screen.findByRole("dialog", {
      name: "Add registration",
    });
    await chooseSelectOption(browser, "Registration type", "National");
    await browser.type(
      within(dialog).getByLabelText("Plate number"),
      "cj12abc",
    );
    await fillDateParts(browser, dialog, "Registered on", "2026-01-16");
    await chooseSelectOption(browser, "Required driver license", "A1");
    await browser.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: {
            registrationType: "national",
            plateNumber: "CJ 12 ABC",
            registeredOn: "2026-01-16",
            registrationExpiresOn: null,
            requiredDriverLicenseType: "A1",
          },
        },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows edit registration for registered scooters", async () => {
    const browser = userEvent.setup();

    renderDetail("en", {
      ...scooter,
      registrationType: "national",
      plateNumber: "CJ 12 ABC",
      registeredOn: "2026-01-16",
      requiredDriverLicenseType: "A1",
    });

    await browser.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByText("Edit registration")).toBeInTheDocument();
    expect(screen.queryByText("Add registration")).not.toBeInTheDocument();
    expect(screen.getAllByText("National")[0]).toBeInTheDocument();
    expect(screen.getByText("CJ 12 ABC")).toBeInTheDocument();
    expect(
      screen.queryByText("Registration expires on"),
    ).not.toBeInTheDocument();
  });

  it("navigates to the edit page from the actions menu", async () => {
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Edit scooter"));

    expect(mocks.push).toHaveBeenCalledWith(`/en/scooters/${scooter.id}/edit`);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("soft-deletes the scooter with confirmation", async () => {
    mocks.apiFetch.mockResolvedValueOnce(undefined);
    const browser = userEvent.setup();

    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Delete scooter"));
    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "Delete scooter" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.delete(scooter.id),
        v1.common.noContentSchema,
        { method: "DELETE" },
      ),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/en/scooters");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

function renderDetail(
  locale: SupportedLocale = "en",
  scooterOverride: v1.scooters.Scooter = scooter,
  overview: v1.maintenance.ScooterMaintenanceOverview = maintenanceOverview(),
  maintenanceTypes: v1.maintenance.MaintenanceTypeList = [],
  financials: v1.finance.ScooterFinancials = scooterFinancials(),
  companyWallets: v1.finance.WalletOption[] = [],
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterDetailPage
        scooter={scooterOverride}
        scootersHref={locale === "en" ? "/en/scooters" : "/scooters"}
        maintenanceOverview={overview}
        maintenanceTypes={maintenanceTypes}
        financials={financials}
        companyWallets={companyWallets}
      />
    </NextIntlClientProvider>,
  );
}

function scooterFinancials(
  overrides: Partial<v1.finance.ScooterFinancials> = {},
): v1.finance.ScooterFinancials {
  return {
    scooterId: scooter.id,
    costBreakdown: [],
    totalCost: [],
    sale: null,
    ...overrides,
  };
}

function maintenanceOverview(
  overrides: Partial<v1.maintenance.ScooterMaintenanceOverview> = {},
): v1.maintenance.ScooterMaintenanceOverview {
  return {
    scooterId: scooter.id,
    currentMileageKm: scooter.currentMileageKm,
    openIssues: [],
    issueCounts: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    hasBlockingIssues: false,
    maintenanceAttentionRequired: false,
    recommendedOperationalStatus: "AVAILABLE",
    maintenanceStatuses: [],
    overdueMaintenance: [],
    dueSoonMaintenance: [],
    activity: [],
    ...overrides,
  };
}

function maintenanceType(): v1.maintenance.MaintenanceType {
  return {
    id: "maintenance-type-1",
    code: "ENGINE_OIL",
    name: "Engine oil change",
    intervalKm: 3_000,
    intervalMonths: 6,
    isActive: true,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  };
}

function maintenanceRecord(
  type: v1.maintenance.MaintenanceType,
): v1.maintenance.MaintenanceRecord {
  return {
    id: "maintenance-record-1",
    scooterId: scooter.id,
    maintenanceTypeId: type.id,
    maintenanceType: type,
    performedAt: "2026-07-10",
    performedKm: 1_250,
    notes: null,
    nextDueKm: 4_250,
    nextDueAt: "2027-01-10",
    recordedByUserId: "user-1",
    createdAt: "2026-07-10T10:00:00.000Z",
    updatedAt: "2026-07-10T10:00:00.000Z",
  };
}

function scooterIssue(): v1.maintenance.ScooterIssue {
  return {
    id: "issue-1",
    scooterId: scooter.id,
    title: "Brake lever loose",
    description: null,
    severity: "HIGH",
    status: "OPEN",
    reportedAt: "2026-07-01T10:00:00.000Z",
    resolvedAt: null,
    reportedByUserId: "user-1",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
  };
}

async function chooseSelectOption(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await browser.click(screen.getByRole("combobox", { name: label }));
  await browser.click(await screen.findByRole("option", { name: option }));
}

async function fillDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  label: string,
  value: string,
) {
  const [year, month, day] = value.split("-");

  await browser.type(within(dialog).getByLabelText(label), day ?? "");
  await browser.type(within(dialog).getByLabelText(`${label} MM`), month ?? "");
  await browser.type(
    within(dialog).getByLabelText(`${label} YYYY`),
    year ?? "",
  );
}

async function replaceDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  label: string,
  value: string,
) {
  const [year, month, day] = value.split("-");
  const dayInput = within(dialog).getByLabelText(label);
  const monthInput = within(dialog).getByLabelText(`${label} MM`);
  const yearInput = within(dialog).getByLabelText(`${label} YYYY`);

  await browser.clear(dayInput);
  await browser.type(dayInput, day ?? "");
  await browser.clear(monthInput);
  await browser.type(monthInput, month ?? "");
  await browser.clear(yearInput);
  await browser.type(yearInput, year ?? "");
}
