// Register the shared mocks before importing components under test.
import {
  mocks,
  createdScooter,
  renderControls,
  fillRequiredScooterForm,
  chooseSelectOption,
} from "./ScooterCreateForm.test.fixtures";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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
