import { messages } from "@repo/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatePartsField } from "@/components/DateField";

function renderField(
  locale: "en" | "ro",
  props: Partial<React.ComponentProps<typeof DatePartsField>> = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <DatePartsField baseId={`date-${locale}`} label="Date" {...props} />
    </NextIntlClientProvider>,
  );
}

/** Drives the picker onto its mobile bottom-sheet surface. */
function useMobileViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal("innerWidth", 390);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DatePartsField", () => {
  it.each([
    { locale: "en" as const, placeholders: ["DD", "MM", "YYYY"] },
    { locale: "ro" as const, placeholders: ["ZZ", "LL", "AAAA"] },
  ])("renders uppercase $locale date parts", ({ locale, placeholders }) => {
    renderField(locale);

    for (const placeholder of placeholders) {
      expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
    }
  });

  it("moves focus after two day digits and two month digits", async () => {
    const browser = userEvent.setup();
    renderField("en", { baseId: "date", name: "date" });

    const day = screen.getByPlaceholderText("DD");
    const month = screen.getByPlaceholderText("MM");
    const year = screen.getByPlaceholderText("YYYY");

    await browser.click(day);
    await browser.type(day, "12");
    expect(month).toHaveFocus();

    await browser.type(month, "08");
    expect(year).toHaveFocus();

    await browser.type(year, "2026");
    expect(screen.getByDisplayValue("2026-08-12")).toHaveAttribute(
      "name",
      "date",
    );
  });

  it.each([
    { locale: "en" as const, triggerName: "Open calendar" },
    { locale: "ro" as const, triggerName: "Deschide calendarul" },
  ])("labels the calendar trigger in $locale", ({ locale, triggerName }) => {
    renderField(locale);

    expect(
      screen.getByRole("button", { name: triggerName }),
    ).toBeInTheDocument();
  });

  it("fills the date parts from a day picked in the calendar", async () => {
    const browser = userEvent.setup();
    const onChange = vi.fn();
    renderField("en", {
      baseId: "date",
      name: "date",
      value: "2026-08-12",
      onChange,
    });

    await browser.click(screen.getByRole("button", { name: "Open calendar" }));

    const dialog = await screen.findByRole("dialog");
    await browser.click(
      within(dialog).getByRole("button", { name: "August 20, 2026" }),
    );

    expect(onChange).toHaveBeenCalledWith("2026-08-20");
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-08-20")).toHaveAttribute(
      "name",
      "date",
    );
  });

  it("opens the calendar in a bottom sheet on mobile viewports", async () => {
    useMobileViewport();
    const browser = userEvent.setup();
    renderField("en", { value: "2026-08-12" });

    await browser.click(screen.getByRole("button", { name: "Open calendar" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-slot", "bottom-sheet-popup");
    expect(within(dialog).getByText("Date")).toBeInTheDocument();
  });

  it("disables the calendar trigger with the field", () => {
    renderField("en", { disabled: true });

    expect(
      screen.getByRole("button", { name: "Open calendar" }),
    ).toBeDisabled();
  });
});
