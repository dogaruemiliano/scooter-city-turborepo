import { messages } from "@repo/i18n";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { CreatePersonFormState } from "./types";
import { AddressSection } from "./AddressSection";
import { createEmptyCreateForm } from "./form-state";

function AddressForm({
  country = "RO",
}: {
  country?: CreatePersonFormState["countryCode"];
}) {
  const [form, setForm] = useState({
    ...createEmptyCreateForm("romanian"),
    countryCode: country,
  });
  return (
    <NextIntlClientProvider locale="ro" messages={messages.ro}>
      <AddressSection
        formId="address"
        form={form}
        fieldErrors={{}}
        locale="ro"
        onSetFormValue={(key, value) =>
          setForm((form) => ({ ...form, [key]: value }))
        }
        onChangeCountry={(value) =>
          setForm((form) => ({
            ...form,
            countryCode: value,
            region: "",
            city: "",
          }))
        }
      />
    </NextIntlClientProvider>
  );
}
async function openPicker(
  browser: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await browser.click(
    screen.getByRole("button", { name: new RegExp(`^${label}(?: |$)`) }),
  );
  return screen.findByRole("dialog", { name: label });
}

async function pick(
  browser: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  value: string,
) {
  await browser.click(within(dialog).getByRole("button", { name: value }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

describe("Romanian locality selection", () => {
  it("searches counties and mixed cities/communes without diacritics, scoped to the selected county", async () => {
    const browser = userEvent.setup();
    render(<AddressForm />);
    expect(
      screen.getByRole("button", { name: /^Localitate(?: |$)/ }),
    ).toBeDisabled();
    const county = await openPicker(browser, "Județ");
    await browser.type(
      within(county).getByRole("textbox", { name: "Caută județe" }),
      "Valcea",
    );
    expect(
      within(county).queryByRole("button", { name: "Cluj" }),
    ).not.toBeInTheDocument();
    await pick(browser, county, "Vâlcea");

    const locality = await openPicker(browser, "Localitate");
    expect(
      within(locality).getByRole("button", {
        name: "Râmnicu Vâlcea",
      }),
    ).toBeInTheDocument();
    expect(
      within(locality).getByRole("button", { name: "Budești" }),
    ).toBeInTheDocument();
    expect(
      within(locality).queryByRole("button", {
        name: "Cluj-Napoca",
      }),
    ).not.toBeInTheDocument();
    await browser.type(
      within(locality).getByRole("textbox", { name: "Caută localități" }),
      "Budesti",
    );
    await pick(browser, locality, "Budești");
    expect(
      screen.getByRole("button", { name: /^Localitate(?: |$)/ }),
    ).toHaveTextContent("Budești");

    // Selecting the current county preserves the locality; changing it clears it.
    await pick(browser, await openPicker(browser, "Județ"), "Vâlcea");
    expect(
      screen.getByRole("button", { name: /^Localitate(?: |$)/ }),
    ).toHaveTextContent("Budești");
    await pick(browser, await openPicker(browser, "Județ"), "Cluj");
    expect(
      screen.getByRole("button", { name: /^Localitate(?: |$)/ }),
    ).toHaveTextContent("Selectează localitatea");
    const nextLocality = await openPicker(browser, "Localitate");
    expect(within(nextLocality).getByRole("textbox")).toHaveValue("");
    expect(
      within(nextLocality).getByRole("button", {
        name: "Florești",
      }),
    ).toBeInTheDocument();
    expect(
      within(nextLocality).queryByRole("button", {
        name: "Budești",
      }),
    ).not.toBeInTheDocument();
  });

  it("supports empty search, clearing search/selection, and keeps the sheet surface distinct", async () => {
    const browser = userEvent.setup();
    render(<AddressForm />);
    const county = await openPicker(browser, "Județ");
    expect(county).toHaveClass("bg-popover", "text-popover-foreground");
    for (const surface of county.querySelectorAll(
      '[data-slot="bottom-sheet-content"], [data-slot="bottom-sheet-header"], [data-slot="bottom-sheet-body"], [data-slot="bottom-sheet-footer"]',
    )) {
      expect(surface).not.toHaveClass("bg-background");
    }
    await browser.type(within(county).getByRole("textbox"), "zzzzzzzz");
    expect(within(county).getByText("Niciun județ găsit")).toBeInTheDocument();
    await browser.click(
      within(county).getByRole("button", { name: "Șterge căutarea" }),
    );
    await pick(browser, county, "Cluj");
    await pick(browser, await openPicker(browser, "Localitate"), "Florești");
    await pick(
      browser,
      await openPicker(browser, "Localitate"),
      "Selectează localitatea",
    );
    expect(
      screen.getByRole("button", { name: /^Localitate(?: |$)/ }),
    ).toHaveTextContent("Selectează localitatea");
    await pick(
      browser,
      await openPicker(browser, "Județ"),
      "Selectează județul",
    );
    expect(
      screen.getByRole("button", { name: /^Localitate(?: |$)/ }),
    ).toBeDisabled();
  });

  it("preserves country search by alternate-language name and clears Romanian address selections", async () => {
    const browser = userEvent.setup();
    render(<AddressForm />);
    await pick(browser, await openPicker(browser, "Județ"), "Cluj");
    await pick(browser, await openPicker(browser, "Localitate"), "Florești");
    const country = await openPicker(browser, "Țară");
    await browser.type(within(country).getByRole("textbox"), "Germany");
    await pick(browser, country, "Germania");
    expect(screen.getByRole("textbox", { name: "Localitate" })).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Județ / regiune" }),
    ).toHaveValue("");
  });

  it("keeps editable text fields for addresses outside Romania", () => {
    render(<AddressForm country="IT" />);
    const locality = screen.getByRole("textbox", { name: "Localitate" });
    fireEvent.change(locality, { target: { value: "Roma" } });
    expect(locality).toHaveValue("Roma");
    expect(
      screen.queryByRole("button", { name: /^Localitate(?: |$)/ }),
    ).not.toBeInTheDocument();
  });
});
