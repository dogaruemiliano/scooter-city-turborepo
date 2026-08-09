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
    icon: null,
    keywords: [],
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
    icon: null,
    keywords: [],
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
  it("keeps both amount rows synchronized", async () => {
    const browser = userEvent.setup();
    renderForm();

    const sourceAmount = screen.getByLabelText("Source amount");
    const destinationAmount = screen.getByLabelText("Destination amount");
    const [sourceCurrency, destinationCurrency] =
      screen.getAllByLabelText("Currency");

    await browser.type(sourceAmount, "125");
    expect(destinationAmount).toHaveValue("125");

    await browser.click(destinationCurrency);
    await browser.click(await screen.findByRole("option", { name: "EUR" }));

    expect(sourceCurrency).toHaveTextContent("EUR");
    expect(destinationCurrency).toHaveTextContent("EUR");
  });

  it("swaps source and destination without a transaction type selector", async () => {
    const browser = userEvent.setup();
    renderForm();

    expect(screen.queryByLabelText("Transaction type")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Payer")).toHaveAttribute(
      "placeholder",
      "Select a payer",
    );
    expect(screen.getByLabelText("Source amount")).toHaveFocus();

    await browser.click(
      screen.getByRole("button", { name: "Swap source and destination" }),
    );

    expect(screen.getByLabelText("Recipient")).toHaveAttribute(
      "placeholder",
      "Select a counterparty (optional)",
    );
  });

  it("searches and selects wallets and categories", async () => {
    const browser = userEvent.setup();
    renderForm();

    const destinationWallet = screen.getByLabelText("Wallet");
    await browser.click(destinationWallet);
    await browser.type(destinationWallet, "reserve");
    await browser.click(
      await screen.findByRole("option", {
        name: /Reserve wallet/,
      }),
    );
    expect(destinationWallet).toHaveValue("Reserve wallet");

    const counterparty = screen.getByLabelText("Payer");
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

  it("marks the expense category as required", () => {
    renderForm({ type: "EXPENSE" });

    expect(screen.getByLabelText("Category")).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText("Category")).toHaveAttribute(
      "placeholder",
      "Select an option",
    );
  });

  it("requires a payer for income", async () => {
    const browser = userEvent.setup();
    renderForm();

    await browser.click(
      screen.getByRole("button", { name: "Create transaction" }),
    );

    expect(await screen.findByText("Payer is required.")).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalledWith(
      v1.finance.ROUTES.transactions.create,
      expect.anything(),
      expect.anything(),
    );
  });

  it("confirms an expense intentionally saved without a recipient", async () => {
    const browser = userEvent.setup();
    renderForm({ type: "EXPENSE" });

    await browser.type(screen.getByLabelText("Source amount"), "42");
    const wallet = screen.getByLabelText("Wallet");
    await browser.click(wallet);
    await browser.type(wallet, "reserve");
    await browser.click(
      await screen.findByRole("option", { name: /Reserve wallet/ }),
    );

    const category = screen.getByLabelText("Category");
    await browser.click(category);
    await browser.type(category, "fuel");
    await browser.click(await screen.findByRole("option", { name: "Fuel" }));
    await browser.type(
      screen.getByLabelText("Description"),
      "Cash expense without a receipt",
    );

    await browser.click(
      screen.getByRole("button", { name: "Create transaction" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Save without a recipient?" }),
    ).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalledWith(
      v1.finance.ROUTES.transactions.create,
      expect.anything(),
      expect.anything(),
    );

    mocks.fetch.mockResolvedValueOnce({ id: "transaction-1" });
    await browser.click(
      screen.getByRole("button", { name: "Save without recipient" }),
    );

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        v1.finance.ROUTES.transactions.create,
        v1.finance.moneyTransactionSchema,
        expect.objectContaining({
          method: "POST",
          json: expect.objectContaining({
            type: "EXPENSE",
            counterpartyId: null,
            description: "Cash expense without a receipt",
          }),
        }),
      ),
    );
  });
});

function renderForm(prefill: { type?: "INCOME" | "EXPENSE" } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages.en}>
      <TransactionCreateForm
        adminWalletIds={[]}
        categories={categories}
        idempotencyKey="test-idempotency-key"
        prefill={{ type: prefill.type ?? "INCOME" }}
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
  return {
    id,
    type,
    name,
    owner,
    cardHolderUserId: null,
    cardHolder: null,
    isActive: true,
  };
}
