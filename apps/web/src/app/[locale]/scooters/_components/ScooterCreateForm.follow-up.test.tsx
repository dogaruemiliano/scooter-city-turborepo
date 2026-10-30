// Register the shared mocks before importing components under test.
import {
  mocks,
  createdScooter,
  renderWizard,
  fillWizardIdentity,
  selectBrand,
  chooseSelectOption,
} from "./ScooterCreateForm.test.fixtures";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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
    const create = screen.getByRole("button", { name: "Created" });
    expect(create).toBeDisabled();
    await browser.click(create);
    expect(mocks.apiFetch).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Complete CIV details" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the condition section inline when recovering an invalid mileage", async () => {
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Unregistered");
    expect(
      screen.getByRole("heading", { name: /07.*Condition & equipment/ }),
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
        vinReviewConfirmed: false,
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
