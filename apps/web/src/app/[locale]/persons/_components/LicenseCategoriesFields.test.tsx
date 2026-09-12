import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { messages } from "@repo/i18n";
import type { v1 } from "@repo/api-shared";
import { LicenseCategoriesFields } from "./LicenseCategoriesFields";

const entries: v1.persons.PersonDriverLicenseCategoryEntry[] = [
  {
    category: "A1",
    issuedOn: "2020-01-15",
    expiresOn: "2030-01-15",
    restrictions: "01",
  },
  { category: "B", issuedOn: "2022-02-20", expiresOn: "2032-02-20" },
];
function setup(disabled = false) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState(entries);
    return (
      <LicenseCategoriesFields
        value={value}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <Harness />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("licence category cards", () => {
  it("shows dates as text and only reveals inputs for the edited card", async () => {
    const onChange = setup();
    const browser = userEvent.setup();
    expect(screen.getByText("A1")).toBeVisible();
    expect(screen.getByText("01/15/2020")).toBeVisible();
    expect(screen.getByText("01/15/2030")).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.querySelector("input")).toBeNull();
    await browser.click(screen.getByRole("button", { name: "Edit A1" }));
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByLabelText("Restrictions")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit B" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Issued on (A1)"), {
      target: { value: "16" },
    });
    await browser.click(
      screen.getByRole("button", { name: "Done editing A1" }),
    );
    expect(screen.getByText("01/16/2020")).toBeVisible();
    expect(document.querySelector("input")).toBeNull();
    expect(onChange.mock.lastCall![0][0]).toMatchObject({
      issuedOn: "2020-01-16",
      restrictions: "01",
    });
  });

  it("opens a new card for editing, excludes duplicate categories, and allows removal", async () => {
    const onChange = setup();
    const browser = userEvent.setup();
    await browser.click(screen.getByRole("button", { name: "Add category" }));
    const select = screen.getByRole("combobox");
    expect(select.querySelector('option[value="A1"]')).toBeNull();
    expect(select.querySelector('option[value="B"]')).toBeNull();
    const category = (select as HTMLSelectElement).value;
    await browser.click(
      screen.getByRole("button", { name: `Remove ${category}` }),
    );
    expect(onChange.mock.lastCall![0]).toEqual(entries);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("disables editing and adding while the document is busy", () => {
    setup(true);
    expect(screen.getByRole("button", { name: "Edit A1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add category" })).toBeDisabled();
  });
});
