import type { v1 } from "@repo/api-shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountBalanceTable } from "./AccountBalanceTable";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) =>
    ({
      "categories.LIABILITY": "Liabilities",
      "roles.PAYABLE_TO_ASSOCIATE": "Owed to an associate",
      empty: "No accounts yet",
    })[key] ?? key,
}));

const balance: v1.finance.LedgerAccountBalance = {
  accountId: "payable",
  bookId: "company",
  code: "PAYABLE_TO_ASSOCIATE",
  name: "Company owes Alex",
  category: "LIABILITY",
  role: "PAYABLE_TO_ASSOCIATE",
  associateId: "alex",
  signedBalanceMinor: -20_000,
  displayBalanceMinor: 20_000,
  postingCount: 2,
  asOf: "2026-10-12T00:00:00.000Z",
};

describe("AccountBalanceTable", () => {
  it("keeps accounting groups and display-balance signs across mobile and desktop", async () => {
    render(
      await AccountBalanceTable({
        balances: [balance],
        currency: "RON",
        locale: "en",
      }),
    );
    expect(screen.getByRole("heading", { name: "Liabilities" })).toBeVisible();
    expect(screen.getAllByText("Company owes Alex")).toHaveLength(2);
    const amounts = screen.getAllByText(/RON\s+200\.00/);
    expect(amounts).toHaveLength(2);
    amounts.forEach((amount) => expect(amount).not.toHaveTextContent("-"));
    expect(screen.getByRole("table").closest('[data-slot="card"]')).toHaveClass(
      "md:flex",
    );
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  it("uses the common empty state without an artificial toolbar", async () => {
    render(
      await AccountBalanceTable({
        balances: [],
        currency: "RON",
        locale: "en",
      }),
    );
    expect(
      screen.getByText("No accounts yet").closest('[data-slot="list-empty"]'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
