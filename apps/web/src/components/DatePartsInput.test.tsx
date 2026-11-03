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
    { emptyPart: "YYYY", previousPart: "MM", remaining: "0" },
    { emptyPart: "MM", previousPart: "DD", remaining: "1" },
  ])(
    "Backspace in empty $emptyPart deletes the last digit of $previousPart",
    async ({ emptyPart, previousPart, remaining }) => {
      const browser = userEvent.setup();
      const onBlur = vi.fn();
      renderField("en", { defaultValue: "2026-08-12", onBlur });
      const current = screen.getByPlaceholderText(emptyPart);
      const previous = screen.getByPlaceholderText(
        previousPart,
      ) as HTMLInputElement;

      await browser.clear(current);
      onBlur.mockClear();
      await browser.keyboard("{Backspace}");

      expect(current).toHaveValue("");
      expect(previous).toHaveValue(remaining);
      expect(previous).toHaveFocus();
      expect(previous.selectionStart).toBe(remaining.length);
      expect(previous.selectionEnd).toBe(remaining.length);
      expect(onBlur).not.toHaveBeenCalled();
    },
  );

  it("keeps deleting backward through the whole date and stops at the empty day", async () => {
    const browser = userEvent.setup();
    const { container } = renderField("en", {
      defaultValue: "2026-08-12",
      name: "date",
    });
    const day = screen.getByPlaceholderText("DD");
    const month = screen.getByPlaceholderText("MM");
    const year = screen.getByPlaceholderText("YYYY");

    await browser.click(year);
    await browser.keyboard("{End}{Backspace>4/}");
    expect(year).toHaveValue("");
    expect(year).toHaveFocus();
    expect(
      container.querySelector('input[type="hidden"][name="date"]'),
    ).toHaveValue("");

    await browser.keyboard("{Backspace>2/}");
    expect(month).toHaveValue("");
    expect(month).toHaveFocus();
    expect(day).toHaveValue("12");

    await browser.keyboard("{Backspace>3/}");
    expect(day).toHaveValue("");
    expect(day).toHaveFocus();
  });

  it("moves back only one segment when the previous segment is also empty", async () => {
    const browser = userEvent.setup();
    renderField("en");
    const year = screen.getByPlaceholderText("YYYY");
    const month = screen.getByPlaceholderText("MM");

    await browser.click(year);
    await browser.keyboard("{Backspace}");
    expect(month).toHaveValue("");
    expect(month).toHaveFocus();

    await browser.keyboard("{Backspace}");
    expect(screen.getByPlaceholderText("DD")).toHaveFocus();
  });

  it("preserves native deletion within a nonempty segment", async () => {
    const browser = userEvent.setup();
    renderField("en", { defaultValue: "2026-08-12" });
    const month = screen.getByPlaceholderText("MM");

    await browser.click(month);
    await browser.keyboard("{Home}{Backspace}");
    expect(month).toHaveValue("08");
    expect(month).toHaveFocus();
    expect(screen.getByPlaceholderText("DD")).toHaveValue("12");

    await browser.keyboard("{ArrowRight}{Backspace}");
    expect(month).toHaveValue("8");
    expect(month).toHaveFocus();
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
