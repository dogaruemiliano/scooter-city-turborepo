import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { v1 } from "@repo/api-shared";

import { PersonalWalletView } from "./PersonalWalletView";

const wallet: v1.finance.Wallet = {
  id: "wallet-1",
  type: "USER",
  ownerUserId: "user-1",
  owner: {
    id: "user-1",
    email: "ana@example.com",
    firstName: "Ana",
    lastName: "Pop",
  },
  cardHolderUserId: null,
  cardHolder: null,
  name: "Personal wallet",
  isActive: true,
  balances: [
    {
      bucket: "USER_SETTLEMENT",
      currency: "RON",
      balance: "12345678901234567.89",
      updatedAt: "2026-07-29T10:15:00.000Z",
    },
  ],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-29T10:15:00.000Z",
};

describe("PersonalWalletView", () => {
  it("renders localized, precision-safe wallet balances", () => {
    render(
      <PersonalWalletView locale="en" transactions={null} wallet={wallet} />,
    );

    expect(
      screen.getByRole("heading", { name: "My wallet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/12,345,678,901,234,567\.89/)).toBeInTheDocument();
    expect(screen.getByText("User settlement")).toBeInTheDocument();
  });

  it("renders a localized empty state", () => {
    render(
      <PersonalWalletView
        locale="ro"
        transactions={null}
        wallet={{ ...wallet, balances: [] }}
      />,
    );

    expect(screen.getByText("Nu există solduri încă.")).toBeInTheDocument();
  });

  it("renders date-grouped transaction history when it is provided", () => {
    const occurredAt = new Date();
    occurredAt.setHours(10, 15, 0, 0);

    render(
      <PersonalWalletView
        locale="en"
        wallet={wallet}
        transactions={{
          items: [transaction(occurredAt.toISOString())],
          page: 1,
          pageSize: 50,
          total: 1,
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Transaction history" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Rental payment")).toBeInTheDocument();
    expect(
      screen.getByText(
        (value) => value.includes("+") && value.includes("125.00"),
      ),
    ).toBeInTheDocument();
  });

  it("does not render transaction history when it is not provided", () => {
    render(
      <PersonalWalletView locale="en" transactions={null} wallet={wallet} />,
    );

    expect(
      screen.queryByRole("heading", { name: "Transaction history" }),
    ).not.toBeInTheDocument();
  });
});

function transaction(occurredAt: string): v1.finance.MoneyTransaction {
  return {
    id: "transaction-1",
    type: "USER_PAYMENT",
    status: "POSTED",
    amount: "125.00",
    currency: "RON",
    financialScope: "COMPANY",
    paymentMethod: "ONLINE_PAYMENT",
    billingStatus: "NOT_BILLED",
    categoryId: null,
    counterpartyId: null,
    counterpartyUserId: "user-1",
    recipientCounterpartyId: null,
    recipientUserId: null,
    debtorCounterpartyId: null,
    debtorUserId: null,
    creditorCounterpartyId: null,
    creditorUserId: null,
    recordedByUserId: "admin-1",
    category: null,
    counterparty: wallet.owner,
    recipient: null,
    debtor: null,
    creditor: null,
    recordedBy: null,
    occurredAt,
    description: "Rental payment",
    idempotencyKey: "transaction-1",
    originTransactionId: null,
    reversalOfTransactionId: null,
    reversalTransactionId: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    balanceChanges: [
      {
        id: "change-1",
        walletId: wallet.id,
        wallet: {
          id: wallet.id,
          type: wallet.type,
          name: wallet.name,
          ownerUserId: wallet.ownerUserId,
          owner: wallet.owner,
        },
        bucket: "USER_SETTLEMENT",
        currency: "RON",
        amountDelta: "125.00",
        createdAt: occurredAt,
      },
    ],
    references: [],
  };
}
