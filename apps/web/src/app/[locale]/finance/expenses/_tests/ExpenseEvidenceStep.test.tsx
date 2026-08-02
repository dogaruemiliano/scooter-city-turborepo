import { messages } from "@repo/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useReducer, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseEvidenceStep } from "../_components/ExpenseEvidenceStep";
import type { SelectedExpenseEvidence } from "../_lib/expense-api";
import {
  clearExpenseErrorsForAction,
  createExpenseFormState,
  expenseFormReducer,
  type ExpenseFormAction,
  type ExpenseFormErrors,
} from "../_lib/expense-form";

vi.mock("../_components/ExpenseEvidencePicker", () => ({
  ExpenseEvidencePicker: ({ label }: { label: string }) => <div>{label}</div>,
}));

describe("ExpenseEvidenceStep advanced errors", () => {
  it("keeps advanced details open after the first corrective VAT edit", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <EvidenceHarness />
      </NextIntlClientProvider>,
    );
    const trigger = screen.getByRole("button", {
      name: "Document and VAT details (optional)",
    });

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true"),
    );
    fireEvent.change(screen.getByLabelText("Net amount"), {
      target: { value: "100" },
    });

    expect(screen.queryByText("Invalid VAT")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});

function EvidenceHarness() {
  const [state, reducerDispatch] = useReducer(expenseFormReducer, {
    ...createExpenseFormState({
      currentUserId: "user-1",
      defaultBusinessEntityId: "entity-1",
      today: "2026-08-01",
    }),
    hasCompanyCui: "YES" as const,
    grossAmount: "119",
    categoryId: "category-1",
    companyWalletId: "wallet-1",
    payeeCounterpartyId: "counterparty-1",
    vatLines: [
      {
        id: "vat-1",
        netAmount: "",
        ratePercent: "19",
        vatAmount: "19",
      },
    ],
  });
  const [errors, setErrors] = useState<ExpenseFormErrors>({
    vatLines: "Invalid VAT",
  });

  function dispatch(action: ExpenseFormAction) {
    reducerDispatch(action);
    setErrors((current) => clearExpenseErrorsForAction(current, action));
  }

  return (
    <ExpenseEvidenceStep
      disabled={false}
      dispatch={dispatch}
      errors={errors}
      fiscalEvidence={fiscalEvidence}
      isVatRegistered
      posEvidence={null}
      state={state}
      onFiscalEvidenceChange={vi.fn()}
      onFiscalProcessingChange={vi.fn()}
      onPosEvidenceChange={vi.fn()}
      onPosProcessingChange={vi.fn()}
    />
  );
}

const fiscalEvidence: SelectedExpenseEvidence = {
  file: new File(["receipt"], "receipt.pdf", { type: "application/pdf" }),
  fileName: "receipt.pdf",
  contentType: "application/pdf",
  byteSize: 7,
  sha256: "a".repeat(64),
};
