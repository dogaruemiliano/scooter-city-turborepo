// Register the shared mocks before importing components under test.
import {
  mocks,
  createdScooter,
  renderControls,
  chooseSelectOption,
} from "./ScooterCreateForm.test.fixtures";
import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("Scooter create controls with the create resolver", () => {
  it("shows only the licence policy and preserves its selection when registration changes", async () => {
    const browser = userEvent.setup();
    renderControls();
    for (const label of [
      "Commercial rental category",
      "Limiter configuration",
      "Limiter threshold (km/h)",
      "Documented constructive speed source",
      "Configuration evidence",
      "Reason for speed configuration correction",
    ])
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    expect(screen.getByText("Application speed cap: 25 km/h.")).toBeVisible();
    await chooseSelectOption(browser, "Required driver license", "AM");
    expect(screen.getByText("Application speed cap: 45 km/h.")).toBeVisible();
    for (const category of ["A1", "A2", "A"]) {
      await chooseSelectOption(browser, "Required driver license", category);
      expect(
        screen.getByText("No driving licence based application speed cap."),
      ).toBeVisible();
    }
    await chooseSelectOption(browser, "Registration type", "Local");
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    expect(
      screen.getByRole("combobox", { name: "Required driver license" }),
    ).toHaveTextContent("A");
    expect(
      screen.getByText("No driving licence based application speed cap."),
    ).toBeVisible();
    await chooseSelectOption(
      browser,
      "Required driver license",
      messages.en.scooters.requiredDriverLicenseTypes.none,
    );
    expect(screen.getByText("Application speed cap: 25 km/h.")).toBeVisible();
  });

  it("defaults local registration to no license before speed is supplied and preserves a manual choice", async () => {
    const browser = userEvent.setup();
    renderControls();
    await chooseSelectOption(browser, "Registration type", "Local");
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent(messages.en.scooters.requiredDriverLicenseTypes.none);
    await chooseSelectOption(browser, "Required driver license", "A1");
    await chooseSelectOption(browser, "Registration type", "National");
    await chooseSelectOption(browser, "Registration type", "Local");
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent("A1");
  });

  it.each(["National", "Local", "Temporary"])(
    "defaults %s registration to no driving license and keeps it when speed changes",
    async (registration) => {
      const browser = userEvent.setup();
      renderControls();
      await chooseSelectOption(browser, "Registration type", registration);
      const license = () =>
        screen.getByRole("combobox", { name: /Required driver license/ });
      expect(license()).toHaveTextContent(
        messages.en.scooters.requiredDriverLicenseTypes.none,
      );
      fireEvent.change(
        screen.getByRole("textbox", { name: "Maximum speed (km/h)" }),
        { target: { value: "45" } },
      );
      expect(license()).toHaveTextContent(
        messages.en.scooters.requiredDriverLicenseTypes.none,
      );
      await chooseSelectOption(browser, "Registration type", "Unregistered");
      await chooseSelectOption(browser, "Registration type", registration);
      expect(license()).toHaveTextContent(
        messages.en.scooters.requiredDriverLicenseTypes.none,
      );
    },
  );

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
      ).toHaveTextContent(messages.en.scooters.requiredDriverLicenseTypes.none);
      fireEvent.change(speed, { target: { value: "45" } });
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: /Required driver license/ }),
        ).toHaveTextContent(
          messages.en.scooters.requiredDriverLicenseTypes.none,
        ),
      );
      fireEvent.change(speed, { target: { value: "25" } });
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: /Required driver license/ }),
        ).toHaveTextContent(
          messages.en.scooters.requiredDriverLicenseTypes.none,
        ),
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
    expect(
      screen.queryByRole("button", { name: "Import JSON" }),
    ).not.toBeInTheDocument();
    const importMenu = screen.getByRole("button", { name: "Document actions" });
    expect(
      screen.getByText("AI powered").compareDocumentPosition(importMenu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(importMenu);
    await browser.click(
      await screen.findByRole("menuitem", { name: "Import JSON" }),
    );
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
    await waitFor(() => expect(importMenu).toHaveFocus());
    expect(
      screen.getByRole("combobox", { name: /Required driver license/ }),
    ).toHaveTextContent(messages.en.scooters.requiredDriverLicenseTypes.none);
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
});
