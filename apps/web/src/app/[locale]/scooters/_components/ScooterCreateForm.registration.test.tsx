// Register the shared mocks before importing components under test.
import {
  mocks,
  createdScooter,
  renderControls,
  renderWizard,
  fillWizardIdentity,
  fillRequiredScooterForm,
  chooseSelectOption,
  fillDateParts,
} from "./ScooterCreateForm.test.fixtures";
import { v1 } from "@repo/api-shared";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("Scooter create controls with the create resolver", () => {
  it("keeps optional registration details collapsed and preserves them when hidden", async () => {
    mocks.apiFetch.mockResolvedValueOnce(createdScooter);
    const browser = userEvent.setup();
    renderWizard();
    await fillWizardIdentity(browser);
    await chooseSelectOption(browser, "Registration type", "Local");
    fireEvent.change(screen.getByRole("textbox", { name: "Plate number" }), {
      target: { value: "vl 18 188" },
    });
    expect(
      screen.queryByRole("textbox", { name: /^Registered on/ }),
    ).toBeNull();
    const toggle = screen.getByRole("button", { name: "Advanced details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await browser.click(toggle);
    const day = screen.getByRole("textbox", { name: "Registered on" });
    expect(day).not.toHaveAttribute("aria-required", "true");
    expect(
      screen.getByRole("heading", { name: "Registration document details" }),
    ).toBeVisible();
    fireEvent.change(day, { target: { value: "16" } });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Registered on MM" }),
      {
        target: { value: "01" },
      },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Registered on YYYY" }),
      {
        target: { value: "2026" },
      },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Registration certificate number" }),
      {
        target: { value: "CERT-123" },
      },
    );
    await browser.click(toggle);
    expect(
      screen.queryByRole("textbox", { name: /^Registered on/ }),
    ).toBeNull();
    await browser.click(toggle);
    expect(screen.getByRole("textbox", { name: "Registered on" })).toHaveValue(
      "16",
    );
    expect(
      screen.getByRole("textbox", { name: "Registration certificate number" }),
    ).toHaveValue("CERT-123");
    await browser.click(toggle);
    await browser.click(screen.getByRole("button", { name: "Create scooter" }));
    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        v1.scooters.ROUTES.create,
        v1.scooters.scooterSchema,
        expect.objectContaining({
          json: expect.objectContaining({
            registrationDate: "2026-01-16",
            registrationCertificateNumber: "CERT-123",
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
    expect(screen.getByRole("textbox", { name: "Plate number" })).toHaveValue(
      "CJ12ABC",
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
});
