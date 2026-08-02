import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { ExpenseCounterpartySelect } from "../_components/ExpenseCounterpartySelect";

vi.mock("../_lib/expense-api", () => ({
  searchExpenseCounterparties: vi.fn().mockResolvedValue({ items: [] }),
}));

describe("ExpenseCounterpartySelect", () => {
  it("marks the payee as required visibly and programmatically", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages.en}>
        <ExpenseCounterpartySelect
          id="expense-payee"
          value=""
          onChange={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("*")).toBeVisible();
    expect(screen.getByText("(required)")).toHaveClass("sr-only");
    expect(screen.getByLabelText(/Payee/)).toHaveAttribute(
      "aria-required",
      "true",
    );
  });
});
