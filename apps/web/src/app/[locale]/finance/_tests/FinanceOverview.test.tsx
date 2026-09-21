import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import FinanceRoutePage from "../page";

const mocks = vi.hoisted(() => ({
  fetchFinance: vi.fn(),
  requireFinanceAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../_lib/finance-server", () => ({
  fetchFinance: mocks.fetchFinance,
  requireFinanceAdmin: mocks.requireFinanceAdmin,
  financeCookieHeader: async () => "session=finance-admin",
}));

vi.mock("../_components/OperationList", () => ({
  OperationList: () => null,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, ...props }: ComponentProps<"a">) => (
    <a href={String(href)} {...props} />
  ),
}));

const bankBalance: v1.finance.LedgerAccountBalance = {
  accountId: "bank-account",
  bookId: "company-book",
  code: "BANK",
  name: "Company bank account",
  category: "ASSET",
  role: "BANK",
  associateId: null,
  signedBalanceMinor: 50_000,
  displayBalanceMinor: 50_000,
  postingCount: 1,
  asOf: "2026-09-11T09:00:00.000Z",
};

const retainedCustodyBalance: v1.finance.LedgerAccountBalance = {
  ...bankBalance,
  accountId: "former-associate-custody",
  code: "CUSTODY_FORMER_ASSOCIATE",
  name: "Former associate company cash",
  role: "COMPANY_CASH_CUSTODY",
  associateId: "former-associate",
  signedBalanceMinor: 25_000,
  displayBalanceMinor: 25_000,
};

describe("Finance overview", () => {
  it("includes company cash retained in inactive custody accounts", async () => {
    mocks.fetchFinance.mockImplementation(
      async (_locale: string, _returnPath: string, path: string) => {
        const [pathname, query] = path.split("?");

        if (pathname === v1.finance.ROUTES.books) {
          return {
            items: [
              {
                id: "company-book",
                name: "Company",
                names: { ro: "Company" },
                type: "COMPANY",
                functionalCurrency: "RON",
                members: [],
              },
            ],
          } satisfies v1.finance.FinanceBookList;
        }

        if (pathname === v1.finance.ROUTES.accounts.balances) {
          const searchParams = new URLSearchParams(query);
          return {
            items:
              searchParams.get("includeInactive") === "true"
                ? [bankBalance, retainedCustodyBalance]
                : [bankBalance],
          };
        }

        if (pathname === v1.finance.ROUTES.operations.list) {
          return { items: [] };
        }

        throw new Error(`Unexpected finance endpoint: ${path}`);
      },
    );

    render(
      await FinanceRoutePage({ params: Promise.resolve({ locale: "en" }) }),
    );

    const balanceCall = mocks.fetchFinance.mock.calls.find(
      ([, , path]) =>
        String(path).split("?")[0] === v1.finance.ROUTES.accounts.balances,
    );
    expect(balanceCall).toBeDefined();
    const balanceQuery = new URLSearchParams(
      String(balanceCall![2]).split("?")[1],
    );
    expect(balanceQuery.get("bookType")).toBe("COMPANY");
    expect(balanceQuery.get("includeInactive")).toBe("true");

    const cashLabel = screen.getByText(
      messages.en.finance.overview.sections.cash,
    );
    expect(cashLabel.nextElementSibling).toHaveTextContent(/RON\s+750\.00/);
    expect(mocks.requireFinanceAdmin).toHaveBeenCalledWith("en", "/finance");
  });
});
