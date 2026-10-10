import { messages } from "@repo/i18n";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import { ScooterImportInstructions } from "./ScooterImportInstructions";
import type { DocumentSource } from "./scooter-document-sources";

const sources: DocumentSource[] = [
  { sourceId: "civ-1", type: "civ", fileName: "CIV-AGM.pdf" },
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("keeps copy feedback with the circular button for three seconds and restarts it on another copy", async () => {
  userEvent.setup();
  vi.useFakeTimers();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ScooterImportInstructions editing disabled={false} sources={sources} />
    </NextIntlClientProvider>,
  );
  const steps = screen.getByText("Copy the prompt below.").closest("ol")!;
  expect(steps.children).toHaveLength(3);
  expect(
    within(steps.children[0] as HTMLElement).getByRole("button", {
      name: "Copy extraction prompt",
    }),
  ).toBeInTheDocument();
  expect(
    within(steps.children[1] as HTMLElement)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([
    "Import papers (all pages)",
    "Vehicle identity card (CIV)",
    "Registration certificate",
    "Insurance policy (all pages)",
  ]);
  const button = screen.getByRole("button", { name: "Copy extraction prompt" });
  const step = button.closest('[data-slot="import-copy-step"]') as HTMLElement;
  expect(button).toHaveClass("rounded-full");
  await act(async () => {
    fireEvent.click(button);
  });
  const prompt = copy.mock.calls[0]?.[0];
  expect(prompt).toMatch(/"schemaVersion"\s*:\s*2/);
  expect(prompt).toMatch(/"sourceId"\s*:\s*"civ-1"/);
  expect(prompt).toContain("CIV-AGM.pdf");
  expect(button).toHaveClass("bg-success");
  expect(within(step).getByRole("status")).toHaveTextContent("Prompt copied");
  act(() => vi.advanceTimersByTime(2000));
  await act(async () => {
    fireEvent.click(button);
  });
  act(() => vi.advanceTimersByTime(2000));
  expect(within(step).getByRole("status")).toHaveTextContent("Prompt copied");
  act(() => vi.advanceTimersByTime(1000));
  expect(within(step).getByRole("status")).toHaveTextContent(
    "Copy extraction prompt",
  );
  expect(button).not.toHaveClass("bg-success");
});

it.each(["en", "ro"] as const)(
  "enables copying only after adding documents in %s",
  async (locale) => {
    const browser = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const renderInstructions = (documents: DocumentSource[]) => (
      <NextIntlClientProvider locale={locale} messages={messages[locale]}>
        <ScooterImportInstructions
          editing={false}
          disabled={false}
          sources={documents}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(renderInstructions([]));
    const text = messages[locale].scooters.documentImport;
    const button = screen.getByRole("button", { name: text.copyPrompt });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      text.addDocumentsToCopy,
    );
    expect(screen.getByText(text.steps.return)).toBeInTheDocument();
    fireEvent.click(button);
    expect(copy).not.toHaveBeenCalled();

    rerender(renderInstructions(sources));
    expect(button).toBeEnabled();
    await browser.click(button);
    const prompt = copy.mock.calls[0]?.[0];
    expect(prompt).toMatch(/"schemaVersion"\s*:\s*2/);
    expect(prompt).toMatch(/"sourceId"\s*:\s*"civ-1"/);
    expect(prompt).toContain("CIV-AGM.pdf");
  },
);
