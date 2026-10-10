import { messages } from "@repo/i18n";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import { ScooterImportInstructions } from "./ScooterImportInstructions";

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
      <ScooterImportInstructions editing disabled={false} />
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
  ).toEqual(["Vehicle identity card (CIV)", "Registration certificate"]);
  const button = screen.getByRole("button", { name: "Copy extraction prompt" });
  const step = button.closest('[data-slot="import-copy-step"]') as HTMLElement;
  expect(button).toHaveClass("rounded-full");
  await act(async () => {
    fireEvent.click(button);
  });
  expect(copy).toHaveBeenCalledWith(
    expect.stringContaining("MANDATORY DOCUMENT INSPECTION"),
  );
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
