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
    render(<PersonalWalletView locale="en" wallet={wallet} />);

    expect(
      screen.getByRole("heading", { name: "My wallet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/12,345,678,901,234,567\.89/)).toBeInTheDocument();
    expect(screen.getByText("User settlement")).toBeInTheDocument();
  });

  it("renders a localized empty state", () => {
    render(
      <PersonalWalletView locale="ro" wallet={{ ...wallet, balances: [] }} />,
    );

    expect(screen.getByText("Nu există solduri încă.")).toBeInTheDocument();
  });
});
