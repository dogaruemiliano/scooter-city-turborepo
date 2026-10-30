// Register the shared mocks before importing components under test.
import {
  mocks,
  brands,
  createdScooter,
  renderWizard,
  fillWizardIdentity,
  chooseSelectOption,
} from "./ScooterCreateForm.test.fixtures";
import { messages } from "@repo/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ScooterCreateForm } from "./ScooterCreateForm";

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

  // This full-form interaction exceeds five seconds on the shared CI runner.
  it("saves operational values and identification together", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await browser.click(
      within(screen.getByRole("radiogroup", { name: "Fuel system" })).getByRole(
        "radio",
        { name: /Fuel injection$/ },
      ),
    );
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
    await browser.click(
      within(screen.getByRole("radiogroup", { name: "Phone stand" })).getByRole(
        "radio",
        { name: /Yes$/ },
      ),
    );
    await browser.click(
      within(
        screen.getByRole("radiogroup", { name: "Phone charging outlet" }),
      ).getByRole("radio", { name: /No$/ }),
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
      fuelSystem: "injection",
      hasGps: false,
      odometerWorking: null,
      speedometerWorking: true,
      currentMileageKm: 0,
      actualMaxSpeedKmh: 0,
      hasPhoneStand: true,
      hasChargingOutlet: false,
      notes: "Needs inspection",
    });
  }, 15_000);
});
