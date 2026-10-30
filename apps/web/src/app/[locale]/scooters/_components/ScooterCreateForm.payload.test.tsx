// Register the shared mocks before importing components under test.
import {
  mocks,
  createdScooter,
  renderControls,
  renderWizard,
  fillWizardIdentity,
  fillRequiredScooterForm,
  chooseSelectOption,
} from "./ScooterCreateForm.test.fixtures";
import { ApiError, v1 } from "@repo/api-shared";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("Scooter create controls with the create resolver", () => {
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
            requiredLicenseCategory: "none",
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
