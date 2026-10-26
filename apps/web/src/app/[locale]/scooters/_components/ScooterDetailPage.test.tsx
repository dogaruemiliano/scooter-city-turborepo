import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterDetailPage } from "./ScooterDetailPage";
// Gallery API interactions are covered independently in ScooterPhotos.test.tsx.
vi.mock("./ScooterPhotos", () => ({ ScooterPhotos: () => null }));
// Inspection requests and confirmation are covered in ScooterItpPanel.test.tsx.
vi.mock("./ScooterItpPanel", () => ({ ScooterItpPanel: () => null }));

const mocks = vi.hoisted(() => ({
  canReportProblem: true,
  apiFetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
    url: (path: string) => `http://localhost:3000${path}`,
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
  mocks.canReportProblem = true;
  mocks.push.mockReset();
  mocks.apiFetch.mockReset();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("ScooterDetailPage", () => {
  it.each([
    ["en", "Report problem", "/en/problems/new"],
    ["ro", "Raportează o problemă", "/problems/new"],
  ] as const)(
    "opens the localized problem form with this scooter selected (%s)",
    async (locale, label, path) => {
      const browser = userEvent.setup();
      renderDetail(locale, { ...scooter, id: "scooter/one" });
      await browser.click(
        screen.getByRole("button", {
          name: messages[locale].scooters.actions.moreActions,
        }),
      );
      await browser.click(await screen.findByRole("menuitem", { name: label }));
      expect(mocks.push).toHaveBeenCalledWith(
        `${path}?scooterId=scooter%2Fone`,
      );
    },
  );

  it("hides report problem without creation permission", async () => {
    mocks.canReportProblem = false;
    const browser = userEvent.setup();
    renderDetail();
    await browser.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.queryByRole("menuitem", { name: "Report problem" }),
    ).not.toBeInTheDocument();
  });

  it("groups the hero identity, mileage, license and concurrent recorded states without VIN", () => {
    renderDetail("ro", {
      ...scooter,
      maintenanceHoldCount: 2,
      hasCivDocument: false,
      requiredLicenseCategory: "A1",
    });
    const hero = within(screen.getByRole("region", { name: "001 YAM" }));
    expect(hero.getByText("Nefuncțional")).toBeInTheDocument();
    expect(
      hero.getByText("Neînmatriculat", { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument();
    expect(hero.getByText("Fără RAR")).toBeInTheDocument();
    expect(
      hero.getByRole("img", { name: /Kilometraj:.*km/ }),
    ).toHaveAccessibleName("Kilometraj: 1.200 km");
    expect(hero.queryByText("125 cc")).not.toBeInTheDocument();
    expect(hero.getByText("Cat. A1")).toBeInTheDocument();
    expect(hero.getByText("Yamaha NMAX")).toBeInTheDocument();
    expect(hero.queryByText(scooter.vin)).not.toBeInTheDocument();
    expect(hero.queryByText("Închiriat")).not.toBeInTheDocument();
  });

  it("keeps missing mileage distinct from zero and does not infer missing CIV data", () => {
    renderDetail("en", { ...scooter, currentMileageKm: null });
    const hero = within(screen.getByRole("region", { name: "001 YAM" }));
    expect(
      hero.getByRole("img", { name: "Total kilometers: Not provided" }),
    ).toHaveTextContent("—");
    expect(hero.queryByText("No RAR")).not.toBeInTheDocument();
    expect(hero.getByText("No license")).toBeInTheDocument();
    expect(hero.queryByText("Total kilometers")).not.toBeInTheDocument();
  });

  it("shows a scooter fallback when a cover fails and retries a changed cover", () => {
    const view = renderDetail("en", { ...scooter, coverUrl: "/first.png" });
    const hero = within(screen.getByRole("region", { name: "001 YAM" }));
    const image = hero.getByRole("img", {
      name: messages.en.scooters.card.photoAlt.replace("{code}", "001 YAM"),
    });
    fireEvent.error(image);
    expect(
      hero.getByRole("img", { name: messages.en.scooters.card.noPhoto }),
    ).toBeInTheDocument();
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterDetailPage
          scooter={{ ...scooter, coverUrl: "/second.png" }}
          scootersHref="/en/scooters"
        />
      </NextIntlClientProvider>,
    );
    expect(
      within(screen.getByRole("region", { name: "001 YAM" })).getByRole("img", {
        name: messages.en.scooters.card.photoAlt.replace("{code}", "001 YAM"),
      }),
    ).toHaveAttribute("src", "http://localhost:3000/second.png");
  });

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
    expect(moreActionsButton.parentElement).not.toContainElement(
      screen.getByRole("region", { name: "001 YAM" }),
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
      expect(
        within(screen.getByRole("region", { name: "001 YAM" })).getByRole(
          "img",
          { name: /CJ 12 ABC/ },
        ),
      ).toBeInTheDocument();
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
        "problems.create": mocks.canReportProblem ? ["ALL"] : [],
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
