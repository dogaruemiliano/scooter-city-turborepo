import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionsPage } from "./TransactionsPage";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  push: vi.fn(),
}));

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.apiFetch,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.push.mockReset();
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: MockIntersectionObserver,
  });
});

describe("TransactionsPage", () => {
  it("keeps controls balanced and appends the next filtered page", async () => {
    const first = transaction({
      id: "transaction-1",
      description: "Accounting",
    });
    const second = transaction({
      id: "transaction-26",
      description: "Internet",
    });
    mocks.apiFetch.mockResolvedValueOnce(
      transactionList([second], { page: 2, total: 26 }),
    );
    const browser = userEvent.setup();

    renderTransactions(transactionList([first], { total: 26 }));

    const filters = screen.getByRole("button", { name: "Filters" });
    const results = screen.getByText("26 transactions");
    const create = screen.getByRole("link", { name: "New transaction" });
    const leftControls = results.parentElement;
    const toolbar = leftControls?.parentElement;

    expect(leftControls).toContainElement(filters);
    expect(toolbar).toContainElement(create);
    expect(toolbar).toHaveClass("justify-between");
    expect(create).toHaveAttribute("href", "/en/finance/transactions/new");

    await browser.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2&pageSize=25"),
        v1.finance.moneyTransactionListSchema,
        { cache: "no-store" },
      );
    });
    expect(mocks.apiFetch.mock.calls[0]?.[0]).toContain("status=POSTED");
    expect(await screen.findAllByText("Internet")).toHaveLength(2);
    expect(screen.getAllByText("Accounting")).toHaveLength(2);
    expect(
      screen.queryByRole("navigation", { name: "Transaction pagination" }),
    ).not.toBeInTheDocument();
  });
});

function renderTransactions(list: v1.finance.MoneyTransactionList) {
  const query = v1.finance.listMoneyTransactionsQuerySchema.parse({
    page: 1,
    pageSize: 25,
    status: "POSTED",
  });

  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <TransactionsPage
        filters={{ status: "POSTED" }}
        list={list}
        locale="en"
        newTransactionHref="/en/finance/transactions/new"
        query={query}
        transactionsHref="/en/finance/transactions"
      />
    </NextIntlClientProvider>,
  );
}

function transaction(
  overrides: Partial<v1.finance.MoneyTransaction> = {},
): v1.finance.MoneyTransaction {
  const occurredAt = "2026-08-02T10:00:00.000Z";

  return {
    id: "transaction-1",
    type: "EXPENSE",
    status: "POSTED",
    amount: "125.00",
    currency: "RON",
    financialScope: "COMPANY",
    paymentMethod: "BANK_TRANSFER",
    billingStatus: "BILLED",
    categoryId: null,
    counterpartyId: null,
    counterpartyUserId: null,
    recipientCounterpartyId: null,
    recipientUserId: null,
    debtorCounterpartyId: null,
    debtorUserId: null,
    creditorCounterpartyId: null,
    creditorUserId: null,
    recordedByUserId: null,
    category: null,
    counterparty: null,
    recipient: null,
    debtor: null,
    creditor: null,
    recordedBy: null,
    occurredAt,
    description: "Accounting",
    idempotencyKey: "transaction-1",
    originTransactionId: null,
    reversalOfTransactionId: null,
    reversalTransactionId: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    balanceChanges: [],
    references: [],
    ...overrides,
  };
}

function transactionList(
  items: v1.finance.MoneyTransaction[],
  overrides: Partial<Omit<v1.finance.MoneyTransactionList, "items">> = {},
): v1.finance.MoneyTransactionList {
  return {
    items,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 25,
    total: overrides.total ?? items.length,
  };
}
