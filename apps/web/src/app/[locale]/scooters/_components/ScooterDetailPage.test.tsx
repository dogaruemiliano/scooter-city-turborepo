import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterDetailPage } from "./ScooterDetailPage";
// Gallery API interactions are covered independently in ScooterPhotos.test.tsx.
vi.mock("./ScooterPhotos", () => ({ ScooterPhotos: () => null }));
// Inspection requests and confirmation are covered in ScooterItpPanel.test.tsx.
vi.mock("./ScooterItpPanel", () => ({ ScooterItpPanel: () => null }));

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
  fleetNumber: 1,
  brandCode: "YAM",
  model: "NMAX",
  color: "White",
  manufactureYear: 2026,
  powertrainType: "combustion",
  engineCode: null,
  engineDisplacementCc: 125,
  powerKw: 8.5,
  registrationType: "unregistered",
  registrationNumber: null,
  registrationDate: null,
  temporaryRegistrationExpiresAt: null,
  requiredLicenseCategory: "none",
  currentMileageKm: 1_200,
  hasGps: null,
  odometerWorking: null,
  speedometerWorking: null,
  actualMaxSpeedKmh: null,
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
  it("shows invalid insurance and ITP as fixed danger areas", () => {
    renderDetail("en", {
      ...scooter,
      hasCivDocument: true,
      registrationType: "national",
      registrationNumber: "B123ABC",
      rentalInsuranceStatus: "expired",
      itpStatus: "failed",
    });
    for (const label of ["Expired insurance", "Failed ITP"]) {
      const area = screen.getByText(label).closest('[data-slot="alert"]');
      expect(area).toHaveAttribute("role", "alert");
      expect(area).toHaveClass("bg-destructive-subtle");
      expect(screen.getByText(label).closest('[data-slot="badge"]')).toBeNull();
    }
    expect(screen.queryByText("Needs CIV")).not.toBeInTheDocument();
  });

  it("renders scooter details and actions", () => {
    renderDetail();

    expect(
      screen.getByRole("heading", { name: "001 YAM" }),
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
      screen.getByRole("heading", { name: "001 YAM" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Maintenance and repairs" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
  });

  it("shows a status badge only for deleted scooters", () => {
    renderDetail("en", { ...scooter, deletedAt: "2026-08-03T12:00:00.000Z" });

    expect(
      screen
        .getAllByText("Deleted")
        .some((element) => element.dataset.slot === "badge"),
    ).toBe(true);
  });

  it("adds scooter registration from the focused dialog", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...scooter,
      registrationType: "national",
      registrationNumber: "CJ 12 ABC",
      registrationDate: "2026-01-16",
      requiredLicenseCategory: "A1",
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
    expect(within(dialog).getByLabelText("Plate number")).toHaveValue(
      "CJ12ABC",
    );
    expect(within(dialog).queryByLabelText("Registered on")).toBeNull();
    await chooseSelectOption(browser, "Required driver license", "A1");
    await browser.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: {
            registrationType: "national",
            registrationNumber: "CJ 12 ABC",
            registrationDate: null,
            temporaryRegistrationExpiresAt: null,
            requiredLicenseCategory: "A1",
          },
        },
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps a duplicate plate error inside the registration sheet and marks the input invalid", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockImplementation((url: string) => {
      if (url === v1.scooters.ROUTES.update(scooter.id)) {
        return Promise.reject(
          new ApiError(
            409,
            "The request conflicts with the current resource state.",
            "SCOOTER_PLATE_CONFLICT",
            { field: "registrationNumber" },
          ),
        );
      }
      return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 25 });
    });
    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    await browser.click(await screen.findByText("Add registration"));
    const dialog = await screen.findByRole("dialog", {
      name: "Add registration",
    });
    await chooseSelectOption(browser, "Registration type", "Local");
    expect(within(dialog).queryByLabelText("Registered on")).toBeNull();
    const plate = within(dialog).getByRole("textbox", {
      name: "Plate number",
    });
    await browser.clear(plate);
    await browser.type(plate, "vl 18 188");
    expect(plate).toHaveValue("VL 18 188");
    await browser.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    const message = messages.en.scooters.feedback.plateConflict;
    await waitFor(() =>
      expect(within(dialog).getByText("Changes not saved")).toBeVisible(),
    );
    expect(within(dialog).getAllByText(message)).toHaveLength(2);
    expect(screen.getAllByText("Changes not saved")).toHaveLength(1);
    expect(plate).toHaveAttribute("aria-invalid", "true");
    expect(plate).toHaveAccessibleDescription(message);
    expect(plate).toHaveFocus();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await browser.clear(plate);
    await browser.type(plate, "vl 222");
    expect(plate).toHaveValue("VL 222");
    expect(plate).not.toHaveAttribute("aria-invalid", "true");
    mocks.apiFetch.mockResolvedValue({
      ...scooter,
      registrationType: "local",
      registrationNumber: "VL 222",
    });
    await browser.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });

  it.each(["national", "local", "temporary"] as const)(
    "edits %s registration through the scooter edit page",
    async (registrationType) => {
      const browser = userEvent.setup();

      renderDetail("en", {
        ...scooter,
        registrationType,
        registrationNumber: "CJ 12 ABC",
        registrationDate: "2026-01-16",
        requiredLicenseCategory: "A1",
      });

      await browser.click(screen.getByRole("button", { name: "More actions" }));
      expect(screen.queryByText("Edit registration")).not.toBeInTheDocument();
      expect(screen.queryByText("Add registration")).not.toBeInTheDocument();
      expect(screen.getByText("CJ 12 ABC")).toBeInTheDocument();
      await browser.click(await screen.findByText("Edit scooter"));
      expect(mocks.push).toHaveBeenCalledWith(
        `/en/scooters/${scooter.id}/edit`,
      );
    },
  );

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
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterDetailPage
        scooter={scooterOverride}
        scootersHref={locale === "en" ? "/en/scooters" : "/scooters"}
      />
    </NextIntlClientProvider>,
  );
}

async function chooseSelectOption(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await browser.click(screen.getByRole("combobox", { name: label }));
  await browser.click(await screen.findByRole("option", { name: option }));
}

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({
    user: {
      effectiveScopes: {
        "persons.read": ["ALL"],
        "persons.create": ["ALL"],
        "persons.update": ["ALL"],
        "persons.archive": ["ALL"],
        "persons.audit.read": ["ALL"],
        "person_documents.read": ["ALL"],
        "person_documents.write": ["ALL"],
        "person_documents.delete": ["ALL"],
        "scooters.read": ["ALL"],
        "scooter_documents.read": ["ALL"],
        "scooters.create": ["ALL"],
        "scooters.update": ["ALL"],
        "scooters.archive": ["ALL"],
      },
    },
  }),
}));
