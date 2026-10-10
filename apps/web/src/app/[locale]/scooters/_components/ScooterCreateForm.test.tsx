import { ApiError, v1 } from "@repo/api-shared";
import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScooterCreateForm } from "./ScooterCreateForm";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
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

describe("ScooterCreateForm", () => {
  it("opens a searchable mobile brand sheet and returns to it after cancelling creation", async () => {
    vi.stubGlobal("innerWidth", 390);
    const browser = userEvent.setup();
    renderCreateForm();
    await browser.click(screen.getByRole("button", { name: "Brand" }));
    const picker = await screen.findByRole("dialog", { name: "Brand" });
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
    renderCreateForm();
    await browser.type(screen.getByLabelText("VIN"), "JYARN23E0RA123456");
    await browser.type(screen.getByLabelText("Model"), "PCX");
    await chooseSelectOption(browser, "Propulsion system", "Combustion");
    await browser.click(screen.getByRole("button", { name: "Brand" }));
    await browser.click(screen.getByRole("button", { name: "Add new brand" }));
    await browser.type(await screen.findByLabelText("Name"), "Honda");
    await browser.click(screen.getByRole("button", { name: "Create brand" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Honda");
    await browser.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Brand" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Brand" })).toHaveTextContent(
      "Honda",
    );
    expect(screen.getByLabelText("Model")).toHaveValue("PCX");
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
    renderCreateForm();
    await browser.type(screen.getByLabelText("VIN"), "JYARN23E0RA123456");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Brand" })).toHaveFocus(),
    );
    expect(screen.getByRole("button", { name: "Brand" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("requires an explicit propulsion selection", () => {
    renderCreateForm();

    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Powertrain and engine")).toBeInTheDocument();
    expect(requiredLabel("Color")).not.toHaveTextContent(/Color\s*\*/);
    expect(
      screen.getByRole("combobox", { name: "Propulsion system" }),
    ).toHaveTextContent("Select powertrain");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("Registration")).toBeInTheDocument();
    expect(screen.getByLabelText("Engine capacity (cm³)")).toHaveValue("");
    expect(screen.getByLabelText("Current mileage (km)")).toHaveValue("");
  });

  it("hides incompatible fields and restores the draft when switching back", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    const engineCcInput = screen.getByLabelText("Engine capacity (cm³)");
    expect(engineCcInput).toHaveValue("");
    await browser.clear(engineCcInput);
    await browser.type(engineCcInput, "125");
    await chooseSelectOption(browser, "Propulsion system", "Electric");

    expect(
      screen.queryByLabelText("Engine capacity (cm³)"),
    ).not.toBeInTheDocument();

    await chooseSelectOption(browser, "Propulsion system", "Combustion");

    expect(screen.getByLabelText("Engine capacity (cm³)")).toHaveValue("125");
  });

  it("requires identity fields but permits unknown technical data", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
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
    renderCreateForm();
    await browser.type(screen.getByLabelText("VIN"), "jyarn23e0ra123456");
    await selectBrand(browser, "Yamaha");
    await chooseSelectOption(browser, "Propulsion system", "Combustion");
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

    renderCreateForm();
    await fillRequiredScooterForm(browser);
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
            requiredLicenseCategory: "none",
            notes: "Maker papers received",
          }),
        },
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/scooters");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("submits an optional nonnegative whole-number mileage", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...createdScooter,
      currentMileageKm: 4_200,
    });
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await browser.type(screen.getByLabelText("Current mileage (km)"), "4200");
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

      renderCreateForm();
      await fillRequiredScooterForm(browser);
      await browser.type(screen.getByLabelText("Current mileage (km)"), value);
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

  it("submits a registered national scooter payload", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...createdScooter,
      registrationType: "national",
      registrationNumber: "CJ 12 ABC",
      registrationDate: v1.common.dateOnlyToday(),
      requiredLicenseCategory: "A1",
    });
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "National");
    expect(
      screen.queryByLabelText("Registration expires on"),
    ).not.toBeInTheDocument();
    await browser.type(screen.getByLabelText("Plate number"), "cj12abc");
    await fillDateParts(browser, "Registered on", v1.common.dateOnlyToday());
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
            registrationDate: v1.common.dateOnlyToday(),
            temporaryRegistrationExpiresAt: null,
            requiredLicenseCategory: "A1",
          }),
        }),
      ),
    );
  });

  it("shows registration expiry only for temporary registration", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await chooseSelectOption(browser, "Registration type", "National");
    expect(
      screen.queryByLabelText("Registration expires on"),
    ).not.toBeInTheDocument();

    await chooseSelectOption(browser, "Registration type", "Local");
    expect(
      screen.queryByLabelText("Registration expires on"),
    ).not.toBeInTheDocument();

    await chooseSelectOption(browser, "Registration type", "Temporary");
    expect(
      screen.getByLabelText("Registration expires on"),
    ).toBeInTheDocument();
  });

  it("rejects invalid national plates before submitting", async () => {
    const browser = userEvent.setup();

    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "National");
    await browser.type(screen.getByLabelText("Plate number"), "CJ 00 ABC");
    await fillDateParts(browser, "Registered on", v1.common.dateOnlyToday());
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

    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));

    expect(
      (
        await screen.findAllByText("A scooter with this VIN already exists.")
      )[0],
    ).toBeInTheDocument();
    expect(screen.getByLabelText("VIN")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("focuses the first invalid control, including the brand search", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(screen.getByLabelText("VIN")).toHaveFocus());
    await browser.type(screen.getByLabelText("VIN"), "JYARN23E0RA123456");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Brand" })).toHaveFocus(),
    );
  });

  it("renders and submits the Romanian form with decimal commas", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderCreateForm("ro");
    await chooseSelectOption(browser, "Sistem de propulsie", "Termic");
    await browser.type(
      screen.getByLabelText("Număr de identificare vehicul — VIN"),
      "JYARN23E0RA123456",
    );
    await browser.click(screen.getByRole("combobox", { name: "Marcă" }));
    await browser.click(await screen.findByRole("option", { name: /Yamaha/ }));
    await browser.type(
      screen.getByLabelText("Capacitate rezervor (L)"),
      "5,25",
    );
    await browser.type(
      screen.getByLabelText("Număr locuri, inclusiv conducătorul"),
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
    const view = renderCreateForm();
    await browser.type(screen.getByLabelText("VIN"), "JYARN23E0RA123456");
    await chooseSelectOption(browser, "Propulsion system", "Combustion");
    await browser.type(screen.getByLabelText("Model"), "PCX");
    await browser.click(screen.getByRole("button", { name: "Add new brand" }));
    await browser.type(await screen.findByLabelText("Name"), "Honda");
    await browser.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Brand" })).toHaveValue(
        "Honda",
      ),
    );
    // A router refresh can return the original brand list before its cache updates.
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterCreateForm scootersHref="/en/scooters" brands={[...brands]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("Model")).toHaveValue("PCX");
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
    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "Temporary");
    await browser.type(screen.getByLabelText("Plate number"), "INVALID");
    await browser.type(
      screen.getByLabelText("Registration certificate number"),
      "CERT-1",
    );
    await fillDateParts(browser, "Registration expires on", "2025-01-01");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(await screen.findByText("Scooter not created")).toBeInTheDocument();
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    expect(screen.queryByLabelText("Plate number")).not.toBeInTheDocument();
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
  });

  it("preserves and revalidates a plate between registered types and clears expiry", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await chooseSelectOption(browser, "Registration type", "Temporary");
    await browser.type(screen.getByLabelText("Plate number"), "CJ 0123");
    await fillDateParts(browser, "Registration expires on", "2025-01-01");
    await chooseSelectOption(browser, "Registration type", "National");
    expect(screen.getByLabelText("Plate number")).toHaveValue("CJ 0123");
    expect(
      await screen.findByText(
        "Plate number does not match the selected registration type.",
      ),
    ).toBeInTheDocument();
    await chooseSelectOption(browser, "Registration type", "Temporary");
    expect(screen.getByLabelText("Registration expires on")).toHaveValue("");
    await waitFor(() =>
      expect(
        screen.queryByText(
          "Plate number does not match the selected registration type.",
        ),
      ).not.toBeInTheDocument(),
    );
  });
  it("focuses an incomplete registration date and localizes numeric limits", async () => {
    const browser = userEvent.setup();
    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Registration type", "National");
    await browser.type(screen.getByLabelText("Plate number"), "CJ 12 ABC");
    await chooseSelectOption(browser, "Required driver license", "A1");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Registered on")).toHaveFocus(),
    );
    await fillDateParts(browser, "Registered on", "2025-01-01");
    await browser.clear(screen.getByLabelText("Power (kW)"));
    await browser.type(screen.getByLabelText("Power (kW)"), "0");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(
      await screen.findByText("Power (kW) must be greater than zero."),
    ).toBeInTheDocument();
    await browser.type(
      screen.getByLabelText("Current mileage (km)"),
      "2147483648",
    );
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(
      await screen.findByText(
        "Current mileage (km) must be 2147483647 or less.",
      ),
    ).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});

describe("CIV selections", () => {
  it("saves enum options and exact custom CIV text", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Fuel type or energy source", "Petrol");
    await chooseSelectOption(browser, "Body type", "Other value from CIV");
    await browser.type(
      screen.getByLabelText("Body type — other"),
      "Legacy body specification",
    );
    await browser.type(
      screen.getByLabelText("National registry number"),
      "ab-001/c",
    );
    expect(screen.getByLabelText("National registry number")).toHaveValue(
      "AB-001/C",
    );
    expect(
      screen.queryByLabelText("Electric motor power (kW)"),
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
    renderCreateForm();
    await fillRequiredScooterForm(browser);
    await chooseSelectOption(browser, "Body type", "Other value from CIV");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Body type — other")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await browser.type(
      screen.getByLabelText("Body type — other"),
      "Custom body",
    );
    await chooseSelectOption(browser, "Body type", "L1e-B — Two-wheel moped");
    expect(
      screen.queryByLabelText("Body type — other"),
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
    renderCreateForm("ro");
    await chooseSelectOption(browser, "Sistem de propulsie", "Hibrid");
    await browser.type(
      screen.getByLabelText("Putere motor electric (kW)"),
      "3.25",
    );
    expect(screen.getByLabelText("Putere motor electric (kW)")).toHaveValue(
      "3,25",
    );
    expect(
      screen.getByLabelText("Capacitate cilindrică (cm³)"),
    ).toBeInTheDocument();
    await chooseSelectOption(browser, "Sistem de propulsie", "Electric");
    expect(
      screen.queryByLabelText("Capacitate rezervor (L)"),
    ).not.toBeInTheDocument();
  });
});

function renderCreateForm(locale: SupportedLocale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ScooterCreateForm
        scootersHref={locale === "en" ? "/en/scooters" : "/scooters"}
        brands={brands}
      />
    </NextIntlClientProvider>,
  );
}

async function selectBrand(
  browser: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await browser.click(screen.getByLabelText("Brand"));
  await browser.click(
    await screen.findByRole("option", { name: new RegExp(name) }),
  );
}

async function fillRequiredScooterForm(
  browser: ReturnType<typeof userEvent.setup>,
) {
  await browser.type(screen.getByLabelText("VIN"), "jyarn23e0ra123456");
  await selectBrand(browser, "Yamaha");
  await chooseSelectOption(browser, "Propulsion system", "Combustion");
  await browser.type(screen.getByLabelText("Model"), "NMAX");
  await browser.type(screen.getByLabelText("Color"), "White");
  await browser.type(screen.getByLabelText("Manufacture year"), "2026");
  await browser.clear(screen.getByLabelText("Engine capacity (cm³)"));
  await browser.type(screen.getByLabelText("Engine capacity (cm³)"), "125");
  await browser.type(screen.getByLabelText("Power (kW)"), "8.5");
  await browser.type(screen.getByLabelText("Notes"), "Maker papers received");
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
  label: string,
  value: string,
) {
  const [year, month, day] = value.split("-");

  await browser.type(screen.getByLabelText(label), day ?? "");
  await browser.type(screen.getByLabelText(`${label} MM`), month ?? "");
  await browser.type(screen.getByLabelText(`${label} YYYY`), year ?? "");
}

function requiredLabel(text: string) {
  return screen.getByText(text).closest("div") ?? screen.getByText(text);
}
