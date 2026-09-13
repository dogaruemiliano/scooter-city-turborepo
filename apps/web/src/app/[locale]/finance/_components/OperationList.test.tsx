import type { v1 } from "@repo/api-shared";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { OperationList } from "./OperationList";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) =>
    ({
      "kinds.EXPENSE": "Expense",
      "statuses.POSTED": "Posted",
      "statuses.REVERSED": "Reversed",
      "columns.date": "Date",
      "columns.description": "Description",
      "columns.category": "Category",
      "columns.amount": "Amount",
      "columns.status": "Status",
    })[key] ?? key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a">) => (
    <a href={String(href)} {...props} />
  ),
}));

const item: v1.finance.FinancialOperationListItem = {
  id: "expense-42",
  bookId: "book-1",
  bookType: "COMPANY",
  kind: "EXPENSE",
  status: "POSTED",
  occurredAt: "2026-08-22T09:30:00.000Z",
  description: "Battery replacement",
  amountMinor: 128_450,
  treatment: "OPERATING_EXPENSE",
  categoryName: "Repairs and maintenance",
  costObjectName: "Scooter SC-104",
  postedAt: "2026-08-22T09:35:00.000Z",
  createdAt: "2026-08-22T09:30:00.000Z",
};

describe("OperationList", () => {
  it("renders a touch-friendly mobile list alongside the desktop table", async () => {
    render(
      await OperationList({
        items: [item],
        currency: "RON",
        locale: "en",
        emptyLabel: "No expenses",
      }),
    );

    const mobileList = screen.getByRole("list");
    expect(mobileList.parentElement).toHaveClass("md:hidden");

    const mobileLink = screen.getAllByRole("link", {
      name: /Battery replacement/,
    })[0];
    expect(mobileLink).toHaveAttribute(
      "href",
      "/finance/operations/expense-42",
    );
    expect(mobileLink).toHaveClass("min-h-16");
    expect(mobileLink).toHaveTextContent("Repairs and maintenance");
    expect(mobileLink).toHaveTextContent("Scooter SC-104");
    expect(mobileLink).toHaveTextContent("Posted");

    const desktopTable = screen.getByRole("table");
    expect(desktopTable.closest('[data-slot="card"]')).toHaveClass(
      "hidden",
      "md:flex",
    );
    expect(screen.getAllByText("Battery replacement")).toHaveLength(2);
  });

  it("keeps reversed operations visible and distinguishes their amounts in both layouts", async () => {
    render(
      await OperationList({
        items: [
          item,
          {
            ...item,
            id: "expense-corrected",
            description: "Corrected expense",
            status: "REVERSED",
          },
        ],
        currency: "RON",
        locale: "en",
        emptyLabel: "No expenses",
      }),
    );

    const mobileList = screen.getByRole("list");
    const reversedLink = within(mobileList).getByRole("link", {
      name: /Corrected expense/,
    });
    expect(reversedLink).toHaveAttribute(
      "href",
      "/finance/operations/expense-corrected",
    );
    expect(within(reversedLink).getByText("Reversed")).toBeInTheDocument();
    expect(reversedLink.querySelector(".line-through")).toHaveTextContent(
      "RON",
    );

    const desktopRows = within(screen.getByRole("table")).getAllByRole("row");
    expect(desktopRows).toHaveLength(3);
    expect(within(desktopRows[2]!).getByText("Reversed")).toBeInTheDocument();
    expect(desktopRows[2]!.querySelector(".line-through")).toHaveTextContent(
      "RON",
    );
    expect(desktopRows[1]!.querySelector(".line-through")).toBeNull();
  });
});
