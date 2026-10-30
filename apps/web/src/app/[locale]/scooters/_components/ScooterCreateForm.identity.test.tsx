// Register the shared mocks before importing components under test.
import {
  mocks,
  createdScooter,
  renderControls,
  renderWizard,
  fillWizardIdentity,
  selectBrand,
  chooseSelectOption,
  requiredLabel,
} from "./ScooterCreateForm.test.fixtures";
import { ApiError, v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("Scooter create controls with the create resolver", () => {
  it("defaults propulsion to combustion and homologation to L1e", () => {
    renderControls();

    expect(
      screen.queryByRole("textbox", { name: "Commercial name" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Model" })).toHaveLength(1);
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

  it("previews the next number with the brand and submits a manual override", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    const number = screen.getByRole("textbox", { name: "Internal number" });
    expect(number).toHaveValue("7");
    await browser.clear(number);
    await browser.type(number, "42");
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json.fleetNumber).toBe(42);
  });

  it("uses automatic allocation when the prefilled number is unchanged", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    expect(
      screen.getByRole("textbox", { name: "Internal number" }),
    ).toHaveValue("7");
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(
      screen.queryByText(messages.en.scooters.numbering.automaticHelp),
    ).toBeNull();
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).not.toHaveProperty(
      "fleetNumber",
    );
  });

  it("preserves the draft and focuses the internal number after a numbering conflict", async () => {
    mocks.apiFetch.mockRejectedValueOnce(
      new ApiError(409, "Number taken", "SCOOTER_FLEET_NUMBER_CONFLICT", {
        field: "fleetNumber",
      }),
    );
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await browser.clear(
      screen.getByRole("textbox", { name: "Internal number" }),
    );
    await browser.type(
      screen.getByRole("textbox", { name: "Internal number" }),
      "7",
    );
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    const number = screen.getByRole("textbox", { name: "Internal number" });
    await waitFor(() => expect(number).toHaveAttribute("aria-invalid", "true"));
    await waitFor(() => expect(number).toHaveFocus());
    expect(number).toHaveValue("7");
    expect(screen.getByRole("textbox", { name: "VIN" })).toHaveValue(
      "JYARN23E0RA123456",
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
});
