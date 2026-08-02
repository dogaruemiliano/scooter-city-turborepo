import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DatePartsField } from "@repo/ui/components";

describe("DatePartsField", () => {
  it.each([
    { locale: "en", placeholders: ["DD", "MM", "YYYY"] },
    { locale: "ro", placeholders: ["ZZ", "LL", "AAAA"] },
  ])("renders uppercase $locale date parts", ({ locale, placeholders }) => {
    render(
      <DatePartsField baseId={`date-${locale}`} label="Date" locale={locale} />,
    );

    for (const placeholder of placeholders) {
      expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
    }
  });

  it("moves focus after two day digits and two month digits", async () => {
    const user = userEvent.setup();
    render(
      <DatePartsField baseId="date" label="Date" locale="en" name="date" />,
    );

    const day = screen.getByPlaceholderText("DD");
    const month = screen.getByPlaceholderText("MM");
    const year = screen.getByPlaceholderText("YYYY");

    await user.click(day);
    await user.type(day, "12");
    expect(month).toHaveFocus();

    await user.type(month, "08");
    expect(year).toHaveFocus();

    await user.type(year, "2026");
    expect(screen.getByDisplayValue("2026-08-12")).toHaveAttribute(
      "name",
      "date",
    );
  });
});
