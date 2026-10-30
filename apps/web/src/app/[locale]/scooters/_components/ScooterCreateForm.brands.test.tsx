// Register the shared mocks before importing components under test.
import {
  mocks,
  brands,
  createdScooter,
  CreateControlsHarness,
  renderControls,
  renderWizard,
  chooseSelectOption,
} from "./ScooterCreateForm.test.fixtures";
import { messages } from "@repo/i18n";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

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
});
