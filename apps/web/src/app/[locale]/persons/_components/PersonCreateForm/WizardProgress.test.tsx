import { messages, type SupportedLocale } from "@repo/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import {
  WizardProgress,
  type PersonProgressStep,
  type PersonWizardStep,
} from "./WizardProgress";

const stepLabels = [
  "Citizenship",
  "Identification documents",
  "Personal details",
  "Driving license",
  "Contact details",
  "Address",
  "Document details",
];

describe("WizardProgress", () => {
  it.each<{
    step: PersonWizardStep;
    current: number;
    available: string[];
  }>([
    { step: "citizenship", current: 1, available: [] },
    { step: "documents", current: 2, available: ["Citizenship"] },
    { step: "personal", current: 3, available: stepLabels },
    { step: "license", current: 4, available: stepLabels },
    { step: "contact", current: 5, available: stepLabels },
    { step: "address", current: 6, available: stepLabels },
    { step: "review", current: 7, available: stepLabels },
  ])(
    "shows the current stage and available navigation for $step",
    ({ step, current, available }) => {
      renderProgress({ step });
      const progress = screen.getByRole("list", {
        name: "Add person progress",
      });
      const items = within(progress).getAllByRole("listitem");

      expect(items).toHaveLength(7);
      expect(
        items.filter((item) => item.getAttribute("aria-current") === "step"),
      ).toEqual([items[current - 1]]);
      expect(items[current - 1]).toHaveTextContent(stepLabels[current - 1]!);
      const title = screen.getByRole("heading", {
        name: stepLabels[current - 1],
      });
      expect(title).toBeVisible();
      expect(
        screen.queryByText(`Step ${current} of 7`),
      ).not.toBeInTheDocument();
      expect(
        progress.compareDocumentPosition(title) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      const buttons = within(progress).queryAllByRole("button");
      expect(buttons).toHaveLength(available.length);
      buttons.forEach((button, index) => {
        expect(button).toHaveAccessibleName(available[index]);
        expect(button).toHaveAttribute("type", "button");
      });
    },
  );

  it("allows returning to the setup phases and jumping between review sections", async () => {
    const browser = userEvent.setup();
    const onSelect = renderProgress({ step: "personal" });
    const progress = screen.getByRole("list", {
      name: "Add person progress",
    });
    const destinations: PersonProgressStep[] = [
      "citizenship",
      "documents",
      "personal",
      "license",
      "contact",
      "address",
      "review",
    ];

    for (const [index, destination] of destinations.entries()) {
      await browser.click(
        within(progress).getByRole("button", { name: stepLabels[index] }),
      );
      expect(onSelect).toHaveBeenNthCalledWith(index + 1, destination);
    }
    expect(onSelect).toHaveBeenCalledTimes(destinations.length);
  });

  it.each<PersonWizardStep>(["documents"])(
    "allows returning to citizenship from %s without skipping ahead",
    async (step) => {
      const browser = userEvent.setup();
      const onSelect = renderProgress({ step });

      await browser.click(screen.getByRole("button", { name: "Citizenship" }));

      expect(onSelect).toHaveBeenCalledExactlyOnceWith("citizenship");
    },
  );

  it("disables every navigation destination while a person is being created", async () => {
    const browser = userEvent.setup();
    const onSelect = renderProgress({ step: "review", disabled: true });
    const progress = screen.getByRole("list", {
      name: "Add person progress",
    });
    const buttons = within(progress).getAllByRole("button");

    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      await browser.click(button);
      button.focus();
      expect(button).not.toHaveFocus();
      await browser.keyboard("{Enter} ");
    }

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("supports keyboard activation for available navigation destinations", async () => {
    const browser = userEvent.setup();
    const onSelect = renderProgress({ step: "personal" });
    const address = screen.getByRole("button", { name: "Address" });

    address.focus();
    await browser.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("address");

    onSelect.mockClear();
    screen.getByRole("button", { name: "Identification documents" }).focus();
    await browser.keyboard(" ");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("documents");
  });

  it("keeps the progress and navigation names localized", () => {
    renderProgress({ step: "contact", locale: "ro" });
    const progress = screen.getByRole("list", {
      name: "Pași pentru adăugarea persoanei",
    });

    expect(
      within(progress).getByRole("button", { name: "Date de contact" }),
    ).toBeInTheDocument();
    expect(
      within(progress).getByRole("button", { name: "Documente de identitate" }),
    ).toBeInTheDocument();
  });
});

function renderProgress({
  step,
  disabled = false,
  locale = "en",
}: {
  step: PersonWizardStep;
  disabled?: boolean;
  locale?: SupportedLocale;
}) {
  const onSelect = vi.fn<(step: PersonProgressStep) => void>();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <WizardProgress step={step} disabled={disabled} onSelect={onSelect} />
    </NextIntlClientProvider>,
  );
  return onSelect;
}
