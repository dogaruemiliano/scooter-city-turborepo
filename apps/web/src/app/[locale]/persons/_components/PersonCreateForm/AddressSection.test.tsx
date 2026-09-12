import { messages } from "@repo/i18n";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
describe("Romanian locality selection", () => {
  it("mixes cities and communes in one county-filtered select and clears it when county changes", () => {
    render(<AddressForm />);
    const locality = screen.getByRole("combobox", { name: "Localitate" });
    expect(locality).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Județ"), {
      target: { value: "Vâlcea" },
    });
    expect(locality).toBeEnabled();
    expect(
      within(locality).getByRole("option", { name: "Râmnicu Vâlcea" }),
    ).toBeInTheDocument();
    expect(
      within(locality).getByRole("option", { name: "Budești" }),
    ).toBeInTheDocument();
    expect(
      within(locality).queryByRole("option", { name: "Cluj-Napoca" }),
    ).not.toBeInTheDocument();
    expect(locality.querySelector("optgroup")).toBeNull();
    fireEvent.change(locality, { target: { value: "Budești" } });
    expect(locality).toHaveValue("Budești");
    fireEvent.change(screen.getByLabelText("Județ"), {
      target: { value: "Cluj" },
    });
    expect(locality).toHaveValue("");
    expect(
      within(locality).getByRole("option", { name: "Florești" }),
    ).toBeInTheDocument();
    expect(
      within(locality).queryByRole("option", { name: "Budești" }),
    ).not.toBeInTheDocument();
  });
  it("keeps a text field for addresses outside Romania", () => {
    render(<AddressForm country="IT" />);
    expect(
      screen.getByRole("textbox", { name: "Localitate" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Localitate" }),
    ).not.toBeInTheDocument();
  });
});
