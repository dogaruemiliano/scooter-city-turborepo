import {
  mocks,
  scooter,
  brands,
  renderEditForm,
  access,
  openTechnical,
  closeTechnical,
} from "./ScooterEditForm.test-helpers";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { ScooterEditForm } from "./ScooterEditForm";
import { scooterEditorDefaults } from "./scooter-editor-schema";

describe("ScooterEditForm", () => {
  it("preserves existing engine, homologation, and license instead of applying create defaults", () => {
    expect(
      scooterEditorDefaults({
        ...scooter,
        powertrainType: "electric",
        vehicleCategory: "L3e",
        registrationType: "local",
        requiredLicenseCategory: "A1",
      }),
    ).toMatchObject({
      powertrainType: "electric",
      vehicleCategory: "L3e",
      requiredLicenseCategory: "A1",
    });
    expect(
      scooterEditorDefaults({ ...scooter, vehicleCategory: null })
        .vehicleCategory,
    ).toBe("");
  });

  it("prefills the form from the scooter", () => {
    renderEditForm();

    expect(screen.getByLabelText("Current mileage (km)")).toHaveValue("1200");
    expect(screen.getByLabelText("Color")).toHaveValue("White");
  });

  it("matches the create panels and preserves saved registration and licence values", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(scooter);
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ScooterEditForm
          scooter={{
            ...scooter,
            registrationType: "local",
            registrationNumber: "VL-BUJORENI-175",
            requiredLicenseCategory: "A1",
          }}
          scooterHref="/en/scooters/scooter-1"
          brands={brands}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /Scooter details/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Propulsion system" }),
    ).toBeInTheDocument();
    await openTechnical(browser);
    expect(
      screen.getByRole("button", { name: "Advanced details" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("heading", { name: "Registration document details" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Power (kW)")).toHaveValue("8.5");
    await closeTechnical(browser);
    expect(screen.getByLabelText("VIN")).toHaveValue(scooter.vin);
    expect(screen.getByLabelText("Model")).toHaveValue("NMAX");
    expect(screen.getByLabelText("Plate number")).toHaveValue(
      "VL-BUJORENI-175",
    );
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent("A1");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await browser.clear(screen.getByLabelText("Plate number"));
    await browser.type(
      screen.getByLabelText("Plate number"),
      "VL-BUJORENI-176",
    );
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: {
            sessionId: "editor-session",
            expectedUpdatedAt: scooter.updatedAt,
            registrationNumber: "VL-BUJORENI-176",
          },
        },
      ),
    );
  });

  it.each(["add", "remove", "reorder"])(
    "enables Save after a photo %s and returns without a redundant scooter write",
    async (operation) => {
      const browser = userEvent.setup();
      renderEditForm();
      const save = screen.getByRole("button", { name: "Save changes" });
      expect(save).toBeDisabled();
      await browser.click(
        screen.getByRole("button", { name: "Start photo upload" }),
      );
      expect(save).toBeDisabled();
      await browser.click(
        screen.getByRole("button", { name: `Saved photo ${operation}` }),
      );
      expect(save).toBeEnabled();
      await browser.click(save);
      expect(mocks.push).toHaveBeenCalledWith("/en/scooters/scooter-1");
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(mocks.apiFetch).not.toHaveBeenCalled();
    },
  );

  it("still saves changed scooter fields after a gallery change", async () => {
    const browser = userEvent.setup();
    mocks.apiFetch.mockResolvedValue(scooter);
    renderEditForm();
    await browser.click(
      screen.getByRole("button", { name: "Saved photo add" }),
    );
    await browser.clear(screen.getByLabelText("Color"));
    await browser.type(screen.getByLabelText("Color"), "Blue");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        {
          method: "PATCH",
          json: {
            sessionId: "editor-session",
            expectedUpdatedAt: scooter.updatedAt,
            color: "Blue",
          },
        },
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/scooters/scooter-1");
  });

  it("edits the fuel system from the propulsion section", async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ...scooter,
      fuelSystem: "carburetor",
    });
    const browser = userEvent.setup();
    renderEditForm();
    const group = screen.getByRole("radiogroup", { name: "Fuel system" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(within(group).queryByRole("radio", { name: /Unknown$/ })).toBeNull();
    expect(
      within(group)
        .getAllByRole("radio")
        .some((radio) => (radio as HTMLInputElement).checked),
    ).toBe(false);
    await browser.click(
      within(group).getByRole("radio", { name: "Carburetor" }),
    );
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({ fuelSystem: "carburetor" }),
        }),
      ),
    );
  });

  it("prefills and saves a changed internal number with the brand code", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...scooter, fleetNumber: 42 });
    const browser = userEvent.setup();
    renderEditForm();
    const input = screen.getByRole("textbox", { name: "Internal number" });
    expect(input).toHaveValue(String(scooter.fleetNumber));
    expect(screen.getByText("YAM")).toBeInTheDocument();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    await browser.clear(input);
    await browser.type(input, "42");
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({ fleetNumber: 42 }),
        }),
      ),
    );
  });

  it("updates the scooter and returns to the detail page", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...scooter, color: "Blue" });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("Color"));
    await browser.type(screen.getByLabelText("Color"), "Blue");
    await browser.clear(screen.getByLabelText("Current mileage (km)"));
    await browser.type(screen.getByLabelText("Current mileage (km)"), "1350");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.update(scooter.id),
        v1.scooters.scooterSchema,
        expect.objectContaining({
          method: "PATCH",
          json: expect.objectContaining({
            color: "Blue",
            currentMileageKm: 1_350,
          }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/en/scooters/scooter-1");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("allows clearing unknown color when sending the PATCH", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ...scooter, color: null });
    const browser = userEvent.setup();

    renderEditForm();
    await browser.clear(screen.getByLabelText("Color"));
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
    const options = mocks.apiFetch.mock.calls[0]![2];
    expect(options.json).toMatchObject({ color: null });
  });

  it("does not send unchanged registration fields", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();

    renderEditForm();
    await browser.type(screen.getByLabelText("Color"), " updated");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    const [, , options] = mocks.apiFetch.mock.calls[0] as [
      string,
      unknown,
      { json: Record<string, unknown> },
    ];
    expect(options.json).not.toHaveProperty("registrationType");
    expect(options.json).not.toHaveProperty("registrationNumber");
    expect(options.json).not.toHaveProperty("registrationDate");
    expect(options.json).not.toHaveProperty("temporaryRegistrationExpiresAt");
    expect(options.json).not.toHaveProperty("requiredLicenseCategory");
  });

  it("disables unchanged saves and sends only changed technical fields", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();
    renderEditForm();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await openTechnical(browser);
    await browser.type(screen.getByLabelText("Length (mm)"), "1900");
    await browser.type(screen.getByLabelText("Fuel tank capacity (L)"), "5.25");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toEqual({
      sessionId: "editor-session",
      expectedUpdatedAt: scooter.updatedAt,
      lengthMm: 1900,
      fuelTankCapacityLiters: 5.25,
    });
  });

  it("clears displacement when changing to electric", async () => {
    mocks.apiFetch.mockResolvedValueOnce(scooter);
    const browser = userEvent.setup();
    renderEditForm();
    await browser.click(screen.getByRole("radio", { name: "Electric" }));
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledOnce());
    expect(mocks.apiFetch.mock.calls[0]![2].json).toEqual({
      sessionId: "editor-session",
      expectedUpdatedAt: scooter.updatedAt,
      powertrainType: "electric",
      fuelSystem: null,
      engineDisplacementCc: null,
      ratedEngineRpm: null,
      fuelTankCapacityLiters: null,
      emissionsStandard: null,
      nationalEmissionsCode: null,
      fuelType: "electric",
      fuelTypeOther: null,
    });
  });

  it("preserves user input on request failure", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("offline"));
    const browser = userEvent.setup();
    renderEditForm();
    await openTechnical(browser);
    await browser.type(screen.getByLabelText("Variant"), "Sport");
    await closeTechnical(browser);
    await browser.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await openTechnical(browser);
    expect(screen.getByLabelText("Variant")).toHaveValue("Sport");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

it("saves scooter fields without document writes or inline brand creation for a limited operator", async () => {
  access.user = {
    isSuperAdmin: false,
    effectiveScopes: {
      "scooters.update": ["ALL"],
      "scooter_documents.read": ["ALL"],
      "scooter_brands.read": ["ALL"],
    },
  };
  mocks.apiFetch.mockResolvedValue(scooter);
  const browser = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterEditForm
        scooter={{
          ...scooter,
          civVersion: "2024",
          insurancePolicies: [
            {
              id: "policy-readonly",
              insuredName: null,
              validFrom: null,
              validUntil: null,
              premiumAmount: null,
              currency: null,
              documentVin: scooter.vin,
              vinReviewConfirmed: false,
              createdAt: scooter.createdAt,
              updatedAt: scooter.updatedAt,
            },
          ],
        }}
        brands={brands}
        scooterHref="/scooters/s"
      />
    </NextIntlClientProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Import JSON" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: messages.en.scooters.brandPicker.addNew,
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Update insurance" }),
  ).not.toBeInTheDocument();
  await openTechnical(browser);
  await browser.type(screen.getByLabelText("Variant"), "Sport");
  await closeTechnical(browser);
  await browser.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
  expect(mocks.apiFetch).toHaveBeenCalledWith(
    v1.scooters.ROUTES.update(scooter.id),
    expect.anything(),
    {
      method: "PATCH",
      json: {
        sessionId: "editor-session",
        expectedUpdatedAt: scooter.updatedAt,
        variant: "Sport",
      },
    },
  );
});
