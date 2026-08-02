import { messages } from "@repo/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExpenseEvidencePicker } from "../_components/ExpenseEvidencePicker";
import type { SelectedExpenseEvidence } from "../_lib/expense-api";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock("../_lib/expense-api", () => ({
  prepareExpenseEvidence: mocks.prepare,
}));

beforeEach(() => {
  mocks.prepare.mockReset();
});

describe("ExpenseEvidencePicker", () => {
  it("reports preparation and clears the old selection before emitting the prepared file", async () => {
    let finishPreparation!: (value: SelectedExpenseEvidence) => void;
    mocks.prepare.mockReturnValue(
      new Promise<SelectedExpenseEvidence>((resolve) => {
        finishPreparation = resolve;
      }),
    );
    const onChange = vi.fn();
    const onProcessingChange = vi.fn();
    const prepared = evidence("new-receipt.pdf");
    const { container } = renderPicker({
      value: evidence("old-receipt.pdf"),
      onChange,
      onProcessingChange,
    });
    const input = container.querySelector<HTMLInputElement>(
      'input[accept*="application/pdf"]',
    )!;

    fireEvent.change(input, {
      target: {
        files: [
          new File(["new receipt"], "new-receipt.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    expect(onProcessingChange).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onChange).not.toHaveBeenCalledWith(prepared);
    expect(screen.getByText("Preparing and checking file...")).toBeVisible();

    finishPreparation(prepared);

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(prepared));
    expect(onProcessingChange).toHaveBeenLastCalledWith(false);
  });

  it("exposes required evidence semantics and a touch-sized remove control", async () => {
    const onChange = vi.fn();
    renderPicker({ value: evidence("receipt.pdf"), onChange, required: true });

    expect(
      screen.getByRole("group", { name: /Fiscal evidence.*required/ }),
    ).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("*")).toBeVisible();
    expect(screen.getByText("(required)")).toHaveClass("sr-only");
    const remove = screen.getByRole("button", { name: "Remove file" });
    expect(remove).toHaveClass("size-12", "md:size-9");

    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

function renderPicker({
  onChange,
  onProcessingChange = vi.fn(),
  required = false,
  value,
}: {
  onChange(value: SelectedExpenseEvidence | null): void;
  onProcessingChange?(processing: boolean): void;
  required?: boolean;
  value: SelectedExpenseEvidence | null;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <ExpenseEvidencePicker
        disabled={false}
        label="Fiscal evidence"
        required={required}
        value={value}
        onChange={onChange}
        onProcessingChange={onProcessingChange}
      />
    </NextIntlClientProvider>,
  );
}

function evidence(fileName: string): SelectedExpenseEvidence {
  return {
    file: new File([fileName], fileName, { type: "application/pdf" }),
    fileName,
    contentType: "application/pdf",
    byteSize: fileName.length,
    sha256: "a".repeat(64),
  };
}
