import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OperationsPage from "../operations/page";
import ExpensesPage from "../expenses/page";

const mocks = vi.hoisted(() => ({
  fetchFinance: vi.fn(),
  requireFinancePermission: vi.fn(),
}));

vi.mock("../_lib/finance-server", () => ({
  fetchFinance: mocks.fetchFinance,
  requireFinancePermission: mocks.requireFinancePermission,
  financeCookieHeader: async () => "session=finance-admin",
}));
vi.mock("../_components/OperationList", () => ({
  OperationList: () => <p>Operation rows</p>,
}));
vi.mock("../_components/OperationFilters", () => ({
  OperationFilters: () => <button>Filters</button>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a">) => (
    <a href={String(href)} {...props} />
  ),
}));

describe("Finance collection routes", () => {
  beforeEach(() => {
    mocks.requireFinancePermission.mockResolvedValue({ isSuperAdmin: true });
    mocks.fetchFinance.mockImplementation(
      async (_locale: string, _returnPath: string, path: string) => {
        if (path === v1.finance.ROUTES.books)
          return {
            items: [
              {
                id: "company",
                name: "Company",
                type: "COMPANY",
                functionalCurrency: "RON",
              },
            ],
          };
        const query = new URL(path, "https://local.test").searchParams;
        return {
          items: [],
          page: Number(query.get("page")),
          pageSize: Number(query.get("pageSize")),
          total: 151,
        };
      },
    );
  });

  it("fetches later operation pages and retains filters on both paging links", async () => {
    render(
      await OperationsPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({
          page: "2",
          bookId: "company",
          status: "POSTED",
          view: "ledger",
        }),
      }),
    );
    const query = mocks.fetchFinance.mock.calls.find(([, , path]) =>
      String(path).startsWith(v1.finance.ROUTES.operations.list),
    )?.[2];
    expect(query).toContain("page=2");
    expect(query).toContain("pageSize=50");
    expect(query).toContain("bookId=company");
    expect(
      screen
        .getByRole("button", { name: "Filters" })
        .closest('[data-slot="list-header"]'),
    ).toContainElement(
      screen.getByRole("link", {
        name: messages.en.finance.overview.addCompanyMoney,
      }),
    );
    const next = new URL(
      screen.getByRole("link", { name: "Next" }).getAttribute("href")!,
      "https://local.test",
    );
    expect(next.searchParams.get("page")).toBe("3");
    expect(next.searchParams.get("bookId")).toBe("company");
    expect(next.searchParams.get("status")).toBe("POSTED");
    expect(next.searchParams.get("view")).toBe("ledger");
    const previous = new URL(
      screen.getByRole("link", { name: "Previous" }).getAttribute("href")!,
      "https://local.test",
    );
    expect(previous.searchParams.has("page")).toBe(false);
  });

  it("enforces expense scope and omits write actions for read-only viewers", async () => {
    mocks.fetchFinance.mockClear();
    mocks.requireFinancePermission.mockResolvedValueOnce({
      effectiveScopes: { "finance.operations.read": ["ALL"] },
    });
    render(
      await ExpensesPage({
        params: Promise.resolve({ locale: "ro" }),
        searchParams: Promise.resolve({ kind: "INCOME", status: "REVERSED" }),
      }),
    );
    const query = mocks.fetchFinance.mock.calls.find(([, , path]) =>
      String(path).startsWith(v1.finance.ROUTES.operations.list),
    )?.[2];
    expect(query).toContain("kind=EXPENSE");
    expect(query).toContain("pageSize=25");
    expect(
      screen.queryByRole("link", {
        name: messages.ro.finance.overview.newExpense,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages.ro.finance.common.previous }),
    ).toBeDisabled();
    const next = new URL(
      screen
        .getByRole("link", { name: messages.ro.finance.common.next })
        .getAttribute("href")!,
      "https://local.test",
    );
    expect(next.pathname).toBe("/finance/expenses");
    expect(next.searchParams.get("kind")).toBe("EXPENSE");
    expect(next.searchParams.get("status")).toBe("REVERSED");
    expect(next.searchParams.get("page")).toBe("2");
  });

  it("lets an out-of-range URL recover directly to the last page", async () => {
    render(
      await OperationsPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({ page: "99", status: "POSTED" }),
      }),
    );
    const previous = new URL(
      screen.getByRole("link", { name: "Previous" }).getAttribute("href")!,
      "https://local.test",
    );
    expect(previous.searchParams.get("page")).toBe("4");
    expect(previous.searchParams.get("status")).toBe("POSTED");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
