import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider } from "react-hook-form";
import { FormSummary } from "@/components/form/FormSummary";
import { useZodForm } from "@/lib/form/use-zod-form";
import { ScooterEditorFields } from "./ScooterEditorFields";
import { ScooterImportReviewProvider } from "./ScooterImportReview";
import {
  scooterCreateFormSchema,
  scooterEditorDefaults,
  type ScooterEditorValues,
} from "./scooter-editor-schema";
import { scooterEditorMessage } from "./scooter-editor-messages";
import { useScooterDocuments } from "./useScooterDocuments";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterCreateForm } from "./ScooterCreateForm";
vi.mock("./ScooterPhotos", () => ({
  ScooterPhotos: ({
    number,
    onDraftsChange,
  }: {
    number?: number;
    onDraftsChange?: (
      drafts: v1.scooters.ScooterPhotoDraft[],
      blocked: boolean,
    ) => void;
  }) => (
    <section>
      <h2>{String(number).padStart(2, "0")}. Photos</h2>
      {onDraftsChange ? (
        <button
          type="button"
          onClick={() =>
            onDraftsChange(
              [
                {
                  uploadToken: "draft-token",
                  fileName: "front.jpg",
                  caption: "Front view",
                  isPublic: true,
                  type: "GALLERY_COVER",
                },
              ],
              false,
            )
          }
        >
          Stage test photo
        </button>
      ) : null}
    </section>
  ),
}));

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: async (path: string, ...args: unknown[]) => {
      if (path === v1.scooters.ROUTES.documents.createEditorSession)
        return {
          id: "editor-session",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        };
      if (
        path ===
        v1.scooters.ROUTES.documents.discardEditorSession("editor-session")
      )
        return { ok: true };
      const result = await mocks.apiFetch(path, ...args);
      return path === v1.scooters.ROUTES.documents.startExtractionJob &&
        result?.extractedData
        ? {
            id: `job-${result.sourceId}`,
            sourceId: result.sourceId,
            documentType: result.documentType,
            status: "completed",
            result,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          }
        : result;
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

const brands: v1.scooterBrands.ScooterBrand[] = [
  {
    id: "brand-1",
    name: "Yamaha",
    code: "YAM",
    scooterCount: 0,
    createdAt: "2026-06-25T10:00:00.000Z",
    updatedAt: "2026-06-25T10:00:00.000Z",
  },
];

const createdScooter: v1.scooters.Scooter = {
  id: "scooter-1",
  vin: "JYARN23E0RA123456",
  brandId: "brand-1",
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
  currentMileageKm: null,
  hasGps: null,
  odometerWorking: null,
  speedometerWorking: null,
  actualMaxSpeedKmh: null,
  notes: "Maker papers received",
  createdAt: "2026-06-25T10:00:00.000Z",
  updatedAt: "2026-06-25T10:00:00.000Z",
  deletedAt: null,
};

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("ScooterCreateForm combined review", () => {
  it("keeps new forms empty when navigating from the list and returning to create again", async () => {
    function NavigationFixture() {
      const [creating, setCreating] = useState(false);
      return creating ? (
        <>
          <button type="button" onClick={() => setCreating(false)}>
            Back to scooters
          </button>
          <ScooterCreateForm scootersHref="/en/scooters" brands={brands} />
        </>
      ) : (
        <button type="button" onClick={() => setCreating(true)}>
          Create scooter
        </button>
      );
    }
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <NavigationFixture />
      </NextIntlClientProvider>,
      { reactStrictMode: true },
    );
    for (let visit = 0; visit < 2; visit++) {
      await user.click(screen.getByRole("button", { name: "Create scooter" }));
      expect(
        screen.getByRole("button", { name: /Drop your scooter documents/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Import more documents" }),
      ).not.toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Back to scooters" }),
      );
    }
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
  it("shows the initial document drop area when a fresh create form mounts in Strict Mode", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterCreateForm scootersHref="/en/scooters" brands={brands} />
      </NextIntlClientProvider>,
      { reactStrictMode: true },
    );
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import more documents" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(messages.en.scooters.creation.importComplete),
    ).not.toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
  it("shows a shared drop zone and one form with a final create action", () => {
    renderWizard();
    expect(
      screen.getByRole("button", { name: /Drop your scooter documents/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Browse files")).toHaveAttribute("multiple");
    expect(screen.getByRole("textbox", { name: "VIN" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /06.*Condition & equipment/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create scooter" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("places photos second and submits their draft settings with the scooter", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    const galleryIndex = headings.findIndex((text) =>
      text?.includes("02. Photos"),
    );
    expect(galleryIndex).toBeGreaterThan(0);
    expect(headings[galleryIndex - 1]).toMatch(/01/);
    expect(headings[galleryIndex + 1]).toMatch(/03/);
    await browser.click(
      screen.getByRole("button", { name: "Stage test photo" }),
    );
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json.photoDrafts).toEqual([
      {
        uploadToken: "draft-token",
        fileName: "front.jpg",
        caption: "Front view",
        isPublic: true,
        type: "GALLERY_COVER",
      },
    ]);
  });

  it("revalidates VIN on every change after its first blur, including after an error clears", async () => {
    const browser = userEvent.setup();
    renderWizard();
    const vin = screen.getByRole("textbox", { name: "VIN" });
    await browser.type(vin, "jyarn23e0ra1234");
    expect(vin).not.toHaveAttribute("aria-invalid", "true");
    await browser.tab();
    await waitFor(() => expect(vin).toHaveAttribute("aria-invalid", "true"));
    await browser.type(vin, "56");
    await waitFor(() =>
      expect(vin).not.toHaveAttribute("aria-invalid", "true"),
    );
    expect(vin).toHaveFocus();
    expect(vin).toHaveValue("JYARN23E0RA123456");
    await browser.type(vin, "8");
    await waitFor(() => expect(vin).toHaveAttribute("aria-invalid", "true"));
    expect(vin).toHaveFocus();
  });

  it("creates from the combined form and requires the registration state explicitly", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await fillWizardIdentity(browser);
    expect(
      screen.getByRole("combobox", { name: "Registration type" }),
    ).toHaveTextContent("Select registration type");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Registration type" }),
      ).toHaveAttribute("aria-invalid", "true"),
    );
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toMatchObject({
      vin: createdScooter.vin,
      brandId: "brand-1",
      powertrainType: "combustion",
      registrationType: "unregistered",
      hasGps: null,
      odometerWorking: null,
      speedometerWorking: null,
      actualMaxSpeedKmh: null,
    });

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        `/en/scooters/${createdScooter.id}`,
      ),
    );
    expect(screen.queryByText("Scooter created")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Finish" }),
    ).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("saves operational values and identification together", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(
      within(
        screen.getByRole("radiogroup", { name: "GPS installed" }),
      ).getByRole("radio", { name: /Without GPS$/ }),
    );
    const gps = within(
      screen.getByRole("radiogroup", { name: "GPS installed" }),
    );
    expect(gps.getAllByRole("radio")).toHaveLength(2);
    await browser.click(gps.getByRole("radio", { name: /Without GPS$/ }));
    expect(
      gps
        .getAllByRole("radio")
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false);
    await browser.click(gps.getByRole("radio", { name: /With GPS$/ }));
    await browser.click(gps.getByRole("radio", { name: /With GPS$/ }));
    expect(
      gps
        .getAllByRole("radio")
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false);
    await browser.click(gps.getByRole("radio", { name: /Without GPS$/ }));
    await browser.click(
      within(screen.getByRole("radiogroup", { name: "Speedometer" })).getByRole(
        "radio",
        { name: /Working$/ },
      ),
    );
    await browser.type(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
      "0",
    );
    await browser.type(
      screen.getByRole("textbox", { name: "Actual maximum speed (km/h)" }),
      "0",
    );
    await browser.type(
      screen.getByRole("textbox", { name: "Notes" }),
      "Needs inspection",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(
      within(
        screen.getByRole("radiogroup", { name: "GPS installed" }),
      ).getByRole("radio", { name: /Without GPS$/ }),
    ).toBeChecked();
    expect(
      within(screen.getByRole("radiogroup", { name: "Odometer" }))
        .getAllByRole("radio")
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false);
    expect(
      within(screen.getByRole("radiogroup", { name: "Speedometer" })).getByRole(
        "radio",
        { name: /Working$/ },
      ),
    ).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
    ).toHaveValue("0");
    expect(
      screen.getByRole("textbox", { name: "Actual maximum speed (km/h)" }),
    ).toHaveValue("0");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "Needs inspection",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toMatchObject({
      vin: createdScooter.vin,
      brandId: "brand-1",
      powertrainType: "combustion",
      hasGps: false,
      odometerWorking: null,
      speedometerWorking: true,
      currentMileageKm: 0,
      actualMaxSpeedKmh: 0,
      notes: "Needs inspection",
    });
  });
});

describe("Scooter creation follow-up and optional steps", () => {
  it("starts with combustion selected and allows changing the required propulsion", async () => {
    const browser = userEvent.setup();
    renderWizard();
    await browser.type(
      screen.getByRole("textbox", { name: "VIN" }),
      "jyarn23e0ra123456",
    );
    await selectBrand(browser, "Yamaha");
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    const group = screen.getByRole("radiogroup", { name: "Propulsion system" });
    expect(group).toHaveAttribute("aria-required", "true");
    expect(within(group).getByRole("radio", { checked: true })).toHaveAttribute(
      "value",
      "combustion",
    );
    const first = screen.getByRole("radio", { name: /Electric$/ });
    await browser.click(first);
    expect(first).toBeChecked();
    expect(first).toHaveFocus();
    await browser.click(screen.getByDisplayValue("combustion"));
    await waitFor(() => expect(group).not.toHaveAttribute("aria-invalid"));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("blocks duplicate creation while navigation to the saved scooter is pending", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        `/en/scooters/${createdScooter.id}`,
      ),
    );
    const create = screen.getByRole("button", { name: "Create scooter" });
    expect(create).toBeDisabled();
    await browser.click(create);
    expect(mocks.apiFetch).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Complete CIV details" }),
    ).not.toBeInTheDocument();
  });

  it("keeps section 5 inline when recovering an invalid mileage", async () => {
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    expect(
      screen.getByRole("heading", { name: /06.*Condition & equipment/ }),
    ).toBeInTheDocument();
    await browser.type(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
      "-1",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.queryByRole("dialog", { name: "Initial condition" }),
    ).not.toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("shows insurance fields inline and submits their values with the main form", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    expect(
      screen.queryByRole("button", { name: "Add insurance details" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await browser.type(
      screen.getByRole("textbox", { name: "Insured name" }),
      "ScooterCity SRL",
    );
    expect(
      screen.queryByRole("textbox", { name: "VIN on insurance" }),
    ).not.toBeInTheDocument();
    await browser.click(
      screen.getByRole("checkbox", {
        name: "I checked that the insurance covers this scooter",
      }),
    );
    await browser.type(
      screen.getByRole("textbox", { name: "Total premium" }),
      "125.50",
    );
    expect(
      screen.queryByRole("textbox", { name: "Currency" }),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json.insurancePolicies).toEqual([
      expect.objectContaining({
        insuredName: "ScooterCity SRL",
        documentVin: null,
        vinReviewConfirmed: true,
        premiumAmount: 125.5,
        currency: "RON",
      }),
    ]);
  });

  it("does not submit an untouched inline insurance placeholder", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    expect(screen.getByRole("textbox", { name: "Insured name" })).toHaveValue(
      "",
    );
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json.insurancePolicies).toEqual([]);
  });
});

describe("Scooter create controls with the create resolver", () => {
  it("opens a searchable mobile brand sheet and returns to it after cancelling creation", async () => {
    vi.stubGlobal("innerWidth", 390);
    const browser = userEvent.setup();
    renderControls();
    await browser.click(screen.getByRole("button", { name: "Brand" }));
    const picker = await screen.findByRole("dialog", {
      name: "Choose a brand",
    });
    expect(picker).toHaveClass("bg-popover");
    await browser.type(
      within(picker).getByRole("textbox", { name: "Search brands" }),
      "missing",
    );
    expect(within(picker).getByText("No brands found")).toBeInTheDocument();
    await browser.click(
      within(picker).getByRole("button", { name: "Add new brand" }),
    );
    const createSheet = await screen.findByRole("dialog", {
      name: "Add new brand",
    });
    expect(createSheet).toHaveClass("bg-popover");
    for (const sheet of [picker, createSheet]) {
      expect(sheet).not.toHaveClass("bg-background");
      for (const surface of sheet.querySelectorAll(
        '[data-slot="bottom-sheet-content"], [data-slot="bottom-sheet-body"], [data-slot="bottom-sheet-header"], [data-slot="bottom-sheet-footer"]',
      )) {
        expect(surface).not.toHaveClass("bg-background");
      }
    }
    await browser.click(
      within(createSheet).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Add new brand" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(picker).getByRole("textbox", { name: "Search brands" }),
    ).toHaveValue("missing");
    await browser.click(
      within(picker).getByRole("button", { name: "Clear brand search" }),
    );
    await browser.type(
      within(picker).getByRole("textbox", { name: "Search brands" }),
      "YAM",
    );
    await browser.click(within(picker).getByRole("button", { name: "Yamaha" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Brand" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Brand" })).toHaveTextContent(
      "Yamaha",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("creates and selects a brand through nested mobile sheets while preserving the scooter draft", async () => {
    vi.stubGlobal("innerWidth", 390);
    mocks.apiFetch.mockRejectedValueOnce(new Error("offline"));
    mocks.apiFetch.mockResolvedValueOnce({
      ...brands[0],
      id: "brand-new",
      name: "Honda",
      code: "HON",
    });
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderControls();
    await browser.type(
      screen.getByRole("textbox", { name: "VIN" }),
      "JYARN23E0RA123456",
    );
    await browser.type(screen.getByRole("textbox", { name: "Model" }), "PCX");
    await chooseSelectOption(browser, "Propulsion system", "Combustion");
    await browser.click(screen.getByRole("button", { name: "Brand" }));
    await browser.click(screen.getByRole("button", { name: "Add new brand" }));
    const createSheet = within(
      await screen.findByRole("dialog", { name: "Add new brand" }),
    );
    await browser.type(
      createSheet.getByRole("textbox", { name: "Name" }),
      "Honda",
    );
    await browser.click(
      createSheet.getByRole("button", { name: "Create brand" }),
    );
    expect(await createSheet.findByRole("alert")).toBeInTheDocument();
    expect(createSheet.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Honda",
    );
    await browser.click(
      createSheet.getByRole("button", { name: "Create brand" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Brand" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Brand" })).toHaveTextContent(
      "Honda",
    );
    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("PCX");
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(3));
    expect(mocks.apiFetch.mock.calls[2]![2].json).toMatchObject({
      brandId: "brand-new",
      model: "PCX",
    });
  });

  it("focuses the mobile brand trigger when the required selection is missing", async () => {
    vi.stubGlobal("innerWidth", 390);
    const browser = userEvent.setup();
    renderWizard();
    await browser.type(
      screen.getByRole("textbox", { name: "VIN" }),
      "JYARN23E0RA123456",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Brand" })).toHaveFocus(),
    );
    expect(screen.getByRole("button", { name: "Brand" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("defaults propulsion to combustion and homologation to L1e", () => {
    renderControls();

    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Powertrain and engine")).toBeInTheDocument();
    expect(requiredLabel("Color")).not.toHaveTextContent(/Color\s*\*/);
    expect(
      screen.getByRole("combobox", { name: "Propulsion system" }),
    ).toHaveTextContent("Combustion");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("Registration")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Engine capacity (cm³)" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
    ).toHaveValue("");
  });

  it("hides incompatible fields and restores the draft when switching back", async () => {
    const browser = userEvent.setup();

    renderControls();
    const engineCcInput = screen.getByRole("textbox", {
      name: "Engine capacity (cm³)",
    });
    expect(engineCcInput).toHaveValue("");
    await browser.clear(engineCcInput);
    await browser.type(engineCcInput, "125");
    await chooseSelectOption(browser, "Propulsion system", "Electric");

    expect(
      screen.queryByRole("textbox", { name: "Engine capacity (cm³)" }),
    ).not.toBeInTheDocument();

    await chooseSelectOption(browser, "Propulsion system", "Combustion");

    expect(
      screen.getByRole("textbox", { name: "Engine capacity (cm³)" }),
    ).toHaveValue("125");
  });

  it("requires identity fields but permits unknown technical data", async () => {
    const browser = userEvent.setup();

    renderWizard();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    expect(await screen.findByText("Scooter not created")).toBeInTheDocument();
    expect(screen.getAllByText("Brand is required.")[0]).toBeInTheDocument();
    expect(screen.queryByText("Color is required.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Engine cc is required for combustion scooters."),
    ).not.toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("creates with identity and explicit propulsion while technical data is unknown", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...createdScooter,
      model: null,
      color: null,
      manufactureYear: null,
      engineDisplacementCc: null,
    });
    const browser = userEvent.setup();
    renderWizard();
    await browser.type(
      screen.getByRole("textbox", { name: "VIN" }),
      "jyarn23e0ra123456",
    );
    await selectBrand(browser, "Yamaha");
    await browser.click(screen.getByDisplayValue("combustion"));
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({
            vin: "JYARN23E0RA123456",
            brandId: "brand-1",
            powertrainType: "combustion",
            model: null,
            color: null,
            manufactureYear: null,
            engineDisplacementCc: null,
          }),
        }),
      ),
    );
  });

  it("submits the normalized create payload", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();

    renderControls();
    await fillRequiredScooterForm(browser);
    for (const [label, value] of [
      ["Model", "NMAX"],
      ["Color", "White"],
      ["Manufacture year", "2026"],
      ["Engine capacity (cm³)", "125"],
      ["Power (kW)", "8.5"],
      ["Notes", "Maker papers received"],
    ] as const) {
      fireEvent.change(screen.getByRole("textbox", { name: label }), {
        target: { value },
      });
    }
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        {
          method: "POST",
          json: expect.objectContaining({
            vin: "JYARN23E0RA123456",
            brandId: "brand-1",
            model: "NMAX",
            color: "White",
            manufactureYear: 2026,
            powertrainType: "combustion",
            engineCode: null,
            engineDisplacementCc: 125,
            powerKw: 8.5,
            currentMileageKm: null,
            registrationType: "unregistered",
            registrationNumber: null,
            registrationDate: null,
            temporaryRegistrationExpiresAt: null,
            requiredLicenseCategory: undefined,
            notes: "Maker papers received",
          }),
        },
      ),
    );
  });

  it("submits an optional nonnegative whole-number mileage", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...createdScooter,
      currentMileageKm: 4_200,
    });
    const browser = userEvent.setup();

    renderControls();
    await fillRequiredScooterForm(browser);
    await browser.type(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
      "4200",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({ currentMileageKm: 4_200 }),
        }),
      ),
    );
  });

  it.each(["12.5", "-1"])(
    "rejects invalid mileage %s before submitting",
    async (value) => {
      const browser = userEvent.setup();

      renderControls();
      await fillRequiredScooterForm(browser);
      await browser.type(
        screen.getByRole("textbox", { name: "Current mileage (km)" }),
        value,
      );
      await browser.click(
        screen.getByRole("button", { name: "Create scooter" }),
      );

      expect(
        await screen.findAllByText(
          "Current mileage must be a nonnegative whole number.",
        ),
      ).toHaveLength(1);
      expect(mocks.apiFetch).not.toHaveBeenCalled();
    },
  );

  it("defaults local registration to no license before speed is supplied and preserves a manual choice", async () => {
    const browser = userEvent.setup();
    renderControls();
    await chooseSelectOption(browser, "Registration type", "Local");
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent("None");
    await chooseSelectOption(browser, "Required driver license", "A1");
    await chooseSelectOption(browser, "Registration type", "National");
    await chooseSelectOption(browser, "Registration type", "Local");
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent("A1");
  });

  it.each([true, false])(
    "auto-fills no license regardless of input order (speed first: %s)",
    async (speedFirst) => {
      const browser = userEvent.setup();
      renderControls();
      const speed = screen.getByRole("textbox", {
        name: "Maximum speed (km/h)",
      });
      if (speedFirst) fireEvent.change(speed, { target: { value: "25" } });
      await chooseSelectOption(browser, "Registration type", "Local");
      if (!speedFirst) fireEvent.change(speed, { target: { value: "25" } });
      expect(
        await screen.findByRole("combobox", {
          name: /Required driver license/,
        }),
      ).toHaveTextContent("None");
      fireEvent.change(speed, { target: { value: "45" } });
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: /Required driver license/ }),
        ).toHaveTextContent("None"),
      );
      fireEvent.change(speed, { target: { value: "25" } });
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: /Required driver license/ }),
        ).toHaveTextContent("None"),
      );
      await chooseSelectOption(browser, "Required driver license", "A1");
      fireEvent.change(speed, { target: { value: "45" } });
      expect(
        screen.getByRole("combobox", { name: /Required driver license/ }),
      ).toHaveTextContent("A1");
    },
  );

  it("imports and submits a 25 km/h scooter without manually choosing a license category", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderControls();
    await browser.click(screen.getByRole("button", { name: "Import JSON" }));
    await browser.click(screen.getByRole("button", { name: "Edit JSON" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Extracted data (JSON)" }),
      {
        target: {
          value: JSON.stringify({
            brandName: "Yamaha",
            vin: createdScooter.vin,
            powertrainType: "combustion",
            maxSpeedKmh: 25,
            registrationType: "local",
            registrationNumber: "14947",
            registrationDate: "2026-01-01",
            requiredLicenseCategory: null,
          }),
        },
      },
    );
    await browser.click(screen.getByRole("button", { name: "Fill fields" }));
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent("None");
    expect(
      screen.queryByText(/field.*could not be interpreted/),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({
            maxSpeedKmh: 25,
            requiredLicenseCategory: "none",
          }),
        }),
      ),
    );
  });

  it("submits a registered national scooter payload", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...createdScooter,
      registrationType: "national",
      registrationNumber: "CJ 12 ABC",
      registrationDate: v1.common.dateOnlyToday(),
      requiredLicenseCategory: "A1",
    });
    const browser = userEvent.setup();

    renderControls();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "National");
    expect(
      screen.queryByRole("textbox", { name: "Registration expires on" }),
    ).not.toBeInTheDocument();
    await browser.type(
      screen.getByRole("textbox", { name: "Plate number" }),
      "cj12abc",
    );
    await chooseSelectOption(browser, "Required driver license", "A1");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        expect.objectContaining({
          method: "POST",
          json: expect.objectContaining({
            registrationType: "national",
            registrationNumber: "CJ 12 ABC",
            registrationDate: null,
            temporaryRegistrationExpiresAt: null,
            requiredLicenseCategory: "A1",
          }),
        }),
      ),
    );
  });

  it("shows only the registration type until registered, with the required plate first", async () => {
    const browser = userEvent.setup();
    renderControls();
    const certificate = () =>
      screen.queryByRole("textbox", {
        name: "Registration certificate number",
      });
    expect(certificate()).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Plate number" }),
    ).not.toBeInTheDocument();
    await chooseSelectOption(browser, "Registration type", "National");
    const type = screen.getByRole("combobox", { name: "Registration type" });
    const plate = screen.getByRole("textbox", { name: "Plate number" });
    expect(type).toHaveTextContent("National");
    expect(
      type.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(certificate()).not.toBeInTheDocument();
    expect(plate).toHaveAttribute("aria-required", "true");
    expect(
      screen.queryByRole("textbox", { name: "Registered on" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Required driver license" }),
    ).not.toHaveAttribute("aria-required", "true");
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    expect(certificate()).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Plate number" }),
    ).not.toBeInTheDocument();
  });

  it("shows registration expiry only for temporary registration", async () => {
    const browser = userEvent.setup();

    renderControls();
    await chooseSelectOption(browser, "Registration type", "National");
    expect(
      screen.queryByRole("textbox", { name: "Registration expires on" }),
    ).not.toBeInTheDocument();

    await chooseSelectOption(browser, "Registration type", "Local");
    expect(
      screen.queryByRole("textbox", { name: "Registration expires on" }),
    ).not.toBeInTheDocument();

    await chooseSelectOption(browser, "Registration type", "Temporary");
    expect(
      screen.getByRole("textbox", { name: "Registration expires on" }),
    ).toBeInTheDocument();
  });

  it("rejects invalid national plates before submitting", async () => {
    const browser = userEvent.setup();

    renderControls();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "National");
    await browser.type(
      screen.getByRole("textbox", { name: "Plate number" }),
      "CJ 00 ABC",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    expect(
      await screen.findAllByText(
        "Plate number does not match the selected registration type.",
      ),
    ).toHaveLength(1);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("maps duplicate VIN conflicts to the VIN field", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new ApiError(409, "Scooter VIN already exists", "SCOOTER_VIN_CONFLICT", {
        field: "vin",
      }),
    );
    const browser = userEvent.setup();

    renderWizard();
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    expect(
      (
        await screen.findAllByText("A scooter with this VIN already exists.")
      )[0],
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "VIN" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("focuses the first invalid control, including the brand search", async () => {
    const browser = userEvent.setup();
    renderWizard();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "VIN" })).toHaveFocus(),
    );
    await browser.type(
      screen.getByRole("textbox", { name: "VIN" }),
      "JYARN23E0RA123456",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Brand" })).toHaveFocus(),
    );
  });

  it("renders and submits the Romanian form with decimal commas", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderControls("ro");
    await chooseSelectOption(browser, "Sistem de propulsie", "Termic");
    await browser.type(
      screen.getByRole("textbox", {
        name: "Număr de identificare vehicul — VIN",
      }),
      "JYARN23E0RA123456",
    );
    await browser.click(screen.getByRole("combobox", { name: "Marcă" }));
    await browser.click(await screen.findByRole("option", { name: /Yamaha/ }));
    await browser.type(
      screen.getByRole("textbox", { name: "Capacitate rezervor (L)" }),
      "5,25",
    );
    await browser.type(
      screen.getByRole("textbox", {
        name: "Număr locuri, inclusiv conducătorul",
      }),
      "2",
    );
    await browser.click(
      screen.getByRole("button", { name: "Creează scuterul" }),
    );
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toMatchObject({
      fuelTankCapacityLiters: 5.25,
      seatsCount: 2,
    });
  });

  it("preserves entered values and selects a newly created brand", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...brands[0],
      id: "brand-new",
      name: "Honda",
      code: "HON",
    });
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    const view = renderControls();
    await browser.type(
      screen.getByRole("textbox", { name: "VIN" }),
      "JYARN23E0RA123456",
    );
    await chooseSelectOption(browser, "Propulsion system", "Combustion");
    await browser.type(screen.getByRole("textbox", { name: "Model" }), "PCX");
    await browser.click(screen.getByRole("button", { name: "Add new brand" }));
    await browser.type(
      await screen.findByRole("textbox", { name: "Name" }),
      "Honda",
    );
    await browser.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Brand" })).toHaveValue(
        "Honda",
      ),
    );
    // A router refresh can return the original brand list before its cache updates.
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <CreateControlsHarness brands={[...brands]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("PCX");
    expect(screen.getByRole("combobox", { name: "Brand" })).toHaveValue(
      "Honda",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(mocks.apiFetch.mock.calls[1]![2].json).toMatchObject({
      brandId: "brand-new",
      model: "PCX",
    });
  });

  it("clears registration values and errors when returning to unregistered", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderControls();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "Temporary");
    await browser.type(
      screen.getByRole("textbox", { name: "Plate number" }),
      "INVALID",
    );
    await fillDateParts(browser, "Registration expires on", "2025-01-01");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(await screen.findByText("Scooter not created")).toBeInTheDocument();
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    expect(
      screen.queryByRole("textbox", { name: "Plate number" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Plate number does not match the selected registration type.",
      ),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toMatchObject({
      registrationType: "unregistered",
      registrationNumber: null,
      registrationDate: null,
      registrationCertificateNumber: null,
      temporaryRegistrationExpiresAt: null,
      requiredLicenseCategory: "none",
    });
  }, 10_000);

  it("preserves and revalidates a plate between registered types and clears expiry", async () => {
    const browser = userEvent.setup();
    renderControls();
    await chooseSelectOption(browser, "Registration type", "Temporary");
    await browser.type(
      screen.getByRole("textbox", { name: "Plate number" }),
      "CJ 0123",
    );
    await fillDateParts(browser, "Registration expires on", "2025-01-01");
    await chooseSelectOption(browser, "Registration type", "National");
    expect(screen.getByRole("textbox", { name: "Plate number" })).toHaveValue(
      "CJ 0123",
    );
    expect(
      await screen.findByText(
        "Plate number does not match the selected registration type.",
      ),
    ).toBeInTheDocument();
    await chooseSelectOption(browser, "Registration type", "Temporary");
    expect(
      screen.getByRole("textbox", { name: "Registration expires on" }),
    ).toHaveValue("");
    await waitFor(() =>
      expect(
        screen.queryByText(
          "Plate number does not match the selected registration type.",
        ),
      ).not.toBeInTheDocument(),
    );
  });
  it("localizes numeric limits", async () => {
    const browser = userEvent.setup();
    renderControls();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "National");
    await browser.type(
      screen.getByRole("textbox", { name: "Plate number" }),
      "CJ 12 ABC",
    );
    await chooseSelectOption(browser, "Required driver license", "A1");
    await browser.clear(screen.getByRole("textbox", { name: "Power (kW)" }));
    await browser.type(
      screen.getByRole("textbox", { name: "Power (kW)" }),
      "0",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(
      await screen.findByText("Power (kW) must be greater than zero."),
    ).toBeInTheDocument();
    await browser.type(
      screen.getByRole("textbox", { name: "Current mileage (km)" }),
      "2147483648",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(
      await screen.findByText(
        "Current mileage (km) must be 2147483647 or less.",
      ),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  }, 10_000);
});

describe("CIV selections", () => {
  it("saves enum options and exact custom CIV text", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    renderControls();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Fuel type or energy source", "Petrol");
    await chooseSelectOption(browser, "Body type", "Other value from CIV");
    await browser.type(
      screen.getByRole("textbox", { name: "Body type — other" }),
      "Legacy body specification",
    );
    await browser.type(
      screen.getByRole("textbox", { name: "National registry number" }),
      "ab-001/c",
    );
    expect(
      screen.getByRole("textbox", { name: "National registry number" }),
    ).toHaveValue("AB-001/C");
    expect(
      screen.queryByRole("textbox", { name: "Electric motor power (kW)" }),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toMatchObject({
      fuelType: "petrol",
      bodyType: "other",
      bodyTypeOther: "Legacy body specification",
      nationalRegistryNumber: "AB-001/C",
    });
  });
  it("requires other text and clears it from the payload when a preset is selected", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    renderControls();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Body type", "Other value from CIV");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Body type — other" }),
    ).toHaveAttribute("aria-invalid", "true");
    await browser.type(
      screen.getByRole("textbox", { name: "Body type — other" }),
      "Custom body",
    );
    await chooseSelectOption(browser, "Body type", "L1e-B — Two-wheel moped");
    expect(
      screen.queryByRole("textbox", { name: "Body type — other" }),
    ).not.toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toMatchObject({
      bodyType: "two_wheel_moped",
      bodyTypeOther: null,
    });
  });
  it("shows both power fields for hybrid and accepts a dot in the Romanian decimal input", async () => {
    const browser = userEvent.setup();
    renderControls("ro");
    await chooseSelectOption(browser, "Sistem de propulsie", "Hibrid");
    await browser.type(
      screen.getByRole("textbox", { name: "Putere motor electric (kW)" }),
      "3.25",
    );
    expect(
      screen.getByRole("textbox", { name: "Putere motor electric (kW)" }),
    ).toHaveValue("3,25");
    expect(
      screen.getByRole("textbox", { name: "Capacitate cilindrică (cm³)" }),
    ).toBeInTheDocument();
    await chooseSelectOption(browser, "Sistem de propulsie", "Electric");
    expect(
      screen.queryByRole("textbox", { name: "Capacitate rezervor (L)" }),
    ).not.toBeInTheDocument();
  });
});

/** Controls stay independently covered while the production create form shows one step. */
function CreateControlsHarness({
  brands: initialBrands,
}: {
  brands: v1.scooterBrands.ScooterBrand[];
}) {
  const t = useTranslations("scooters");
  const [createdBrands, setCreatedBrands] = useState<
    v1.scooterBrands.ScooterBrand[]
  >([]);
  const documents = useScooterDocuments();
  const form = useZodForm<ScooterEditorValues, v1.scooters.CreateScooterInput>(
    scooterCreateFormSchema,
    {
      defaultValues: {
        ...scooterEditorDefaults(),
        registrationType: "unregistered",
      },
      labelFor: (path) => t(`fields.${path === "brandId" ? "brand" : path}`),
      messageOverride: (issue, path) => scooterEditorMessage(issue, path, t),
    },
  );
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(async (input) => {
          await mocks.apiFetch(
            v1.scooters.ROUTES.create,
            v1.scooters.scooterSchema,
            { method: "POST", json: input },
          );
        })}
      >
        <FormSummary title={t("feedback.createErrorTitle")} />
        <ScooterImportReviewProvider editing={false}>
          <ScooterEditorFields
            brands={[...initialBrands, ...createdBrands]}
            persistedPolicyIds={[]}
            documents={documents}
            editing={false}
            disabled={false}
            onRawFields={() => {}}
            rawFields={{}}
            onBrandCreated={(brand) =>
              setCreatedBrands((current) => [...current, brand])
            }
          />
        </ScooterImportReviewProvider>
        <button type="submit">{t("actions.create")}</button>
      </form>
    </FormProvider>
  );
}

function renderControls(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <CreateControlsHarness brands={brands} />
    </NextIntlClientProvider>,
  );
}

function renderWizard(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterCreateForm scootersHref="/en/scooters" brands={brands} />
    </NextIntlClientProvider>,
  );
}

async function fillWizardIdentity(browser: ReturnType<typeof userEvent.setup>) {
  await browser.type(
    screen.getByRole("textbox", { name: "VIN" }),
    "jyarn23e0ra123456",
  );
  await selectBrand(browser, "Yamaha");
  expect(
    within(
      screen.getByRole("radiogroup", { name: "Propulsion system" }),
    ).getByRole("radio", { checked: true }),
  ).toHaveAttribute("value", "combustion");
}

async function selectBrand(
  browser: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const trigger = screen.getByRole("combobox", { name: "Brand" });
  await browser.click(trigger);
  await browser.click(
    await screen.findByRole("option", { name: new RegExp(name) }),
  );
  await waitFor(() =>
    expect(trigger).toHaveAttribute("aria-expanded", "false"),
  );
}

async function fillRequiredScooterForm(
  browser: ReturnType<typeof userEvent.setup>,
) {
  // Optional field normalization is covered by its own test. Keep shared setup
  // to the identity fields needed to submit the controls harness.
  fireEvent.change(screen.getByRole("textbox", { name: "VIN" }), {
    target: { value: "jyarn23e0ra123456" },
  });
  await selectBrand(browser, "Yamaha");
  await chooseSelectOption(browser, "Propulsion system", "Combustion");
}

async function chooseSelectOption(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  // Role queries avoid jsdom resolving labels for every element in the CIV form.
  const trigger = screen.getByRole("combobox", { name: label });
  await browser.click(trigger);
  await browser.click(await screen.findByRole("option", { name: option }));
  await waitFor(() =>
    expect(trigger).toHaveAttribute("aria-expanded", "false"),
  );
}

async function fillDateParts(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const [year, month, day] = value.split("-");

  await browser.type(screen.getByRole("textbox", { name: label }), day ?? "");
  await browser.type(
    screen.getByRole("textbox", { name: `${label} MM` }),
    month ?? "",
  );
  await browser.type(
    screen.getByRole("textbox", { name: `${label} YYYY` }),
    year ?? "",
  );
}

function requiredLabel(text: string) {
  return screen.getByText(text).closest("div") ?? screen.getByText(text);
}

vi.mock("@/components/auth/SessionProvider", () => ({
  useOptionalSession: () => ({ user: { isSuperAdmin: true } }),
}));
