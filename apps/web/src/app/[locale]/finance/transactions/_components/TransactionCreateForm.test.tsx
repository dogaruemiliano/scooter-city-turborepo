import { v1 } from "@repo/api-shared";
import { messages } from "@repo/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionCreateForm } from "./TransactionCreateForm";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/lib/api", () => ({
  webApi: {
    fetch: mocks.fetch,
  },
}));

const wallets = [
  wallet("operating", "COMPANY_BANK", "Operating wallet"),
  wallet("reserve", "COMPANY_CASH", "Reserve wallet"),
  wallet("customer", "USER", "Customer wallet", {
    id: "user-1",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  }),
  wallet("customer-2", "USER", "Second customer wallet", {
    id: "user-2",
    email: "ada.secondary@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  }),
];

const categories: v1.finance.FinancialCategory[] = [
  {
    id: "rental-income",
    code: "RENTAL_INCOME",
    name: "Rental income",
    kind: "INCOME",
    parentCategoryId: null,
    isActive: true,
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:00.000Z",
  },
  {
    id: "fuel",
    code: "FUEL",
    name: "Fuel",
    kind: "EXPENSE",
    parentCategoryId: null,
    isActive: true,
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:00.000Z",
  },
];

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({
    items: [
      {
        id: "counterparty-person-1",
        kind: "PERSON",
        label: "Ada Lovelace",
        description: "ada@example.com · …1234",
        email: "ada@example.com",
        phoneMasked: "…1234",
        identifierMasked: "…5678",
      },
      {
        id: "counterparty-company-1",
        kind: "COMPANY",
        label: "Ada Mobility SRL",
        description: "office@ada.example · …9090",
        email: "office@ada.example",
        phoneMasked: "…9090",
        identifierMasked: "…4321",
      },
    ],
    nextCursor: null,
  });
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("TransactionCreateForm", () => {
  it("searches and selects wallets and categories", async () => {
    const browser = userEvent.setup();
    renderForm();

    const destinationWallet = screen.getByLabelText("Destination wallet");
    await browser.click(destinationWallet);
    await browser.type(destinationWallet, "reserve");
    await browser.click(
      await screen.findByRole("option", {
        name: /Reserve wallet/,
      }),
    );
    expect(destinationWallet).toHaveValue("Reserve wallet");

    const counterparty = screen.getByLabelText("Counterparty");
    await browser.click(counterparty);
    await browser.type(counterparty, "ada");
    expect(
      await screen.findByRole("option", {
        name: /Ada Lovelace.*ada@example\.com.*5678/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: /Ada Mobility SRL.*office@ada\.example.*4321/,
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        expect.stringContaining("search=ada"),
        v1.finance.financialCounterpartySearchResultSchema,
        expect.objectContaining({ cache: "no-store" }),
      ),
    );
    await browser.click(
      screen.getByRole("option", { name: /Ada Mobility SRL/ }),
    );
    expect(counterparty).toHaveValue("Ada Mobility SRL");

    const category = screen.getByLabelText("Category");
    await browser.click(category);
    await browser.type(category, "rental");
    await browser.click(
      await screen.findByRole("option", { name: "Rental income" }),
    );
    expect(category).toHaveValue("Rental income");
  });
});

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <TransactionCreateForm
        adminWalletIds={[]}
        categories={categories}
        idempotencyKey="test-idempotency-key"
        prefill={{ type: "INCOME" }}
        transactionsHref="/en/finance/transactions"
        wallets={wallets}
      />
    </NextIntlClientProvider>,
  );
}

function wallet(
  id: string,
  type: v1.finance.WalletType,
  name: string,
  owner: v1.finance.FinanceUserSummary | null = null,
): v1.finance.WalletOption {
  return { id, type, name, owner, isActive: true };
}
