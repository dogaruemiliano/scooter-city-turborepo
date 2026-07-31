import { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";

import {
  buildTransactionInput,
  createTransactionFormState,
  type TransactionFormState,
} from "./transaction-recipes";

const companyCash = wallet("company-cash", "COMPANY_CASH");
const companyBank = wallet("company-bank", "COMPANY_BANK");
const customerWallet = wallet("customer-wallet", "USER", "customer");
const adminOneWallet = wallet("admin-one-wallet", "USER", "admin-one");
const adminTwoWallet = wallet("admin-two-wallet", "USER", "admin-two");
const wallets = [
  companyCash,
  companyBank,
  customerWallet,
  adminOneWallet,
  adminTwoWallet,
];

describe("transaction recipes", () => {
  it.each([
    {
      type: "INCOME",
      primaryWalletId: companyCash.id,
      expected: [["company-cash", "BUSINESS_FUNDS", "25.50"]],
    },
    {
      type: "EXPENSE",
      primaryWalletId: companyCash.id,
      expected: [["company-cash", "BUSINESS_FUNDS", "-25.50"]],
    },
    {
      type: "TRANSFER",
      primaryWalletId: companyCash.id,
      secondaryWalletId: companyBank.id,
      expected: [
        ["company-cash", "BUSINESS_FUNDS", "-25.50"],
        ["company-bank", "BUSINESS_FUNDS", "25.50"],
      ],
    },
    {
      type: "USER_CHARGE",
      primaryWalletId: customerWallet.id,
      expected: [["customer-wallet", "USER_SETTLEMENT", "-25.50"]],
    },
    {
      type: "USER_PAYMENT",
      primaryWalletId: customerWallet.id,
      secondaryWalletId: companyCash.id,
      expected: [
        ["customer-wallet", "USER_SETTLEMENT", "25.50"],
        ["company-cash", "BUSINESS_FUNDS", "25.50"],
      ],
    },
    {
      type: "GUARANTEE_RECEIVED",
      primaryWalletId: customerWallet.id,
      secondaryWalletId: companyCash.id,
      expected: [
        ["customer-wallet", "USER_SETTLEMENT", "25.50"],
        ["company-cash", "CUSTOMER_GUARANTEE_FUNDS", "25.50"],
      ],
    },
    {
      type: "GUARANTEE_REFUNDED",
      primaryWalletId: customerWallet.id,
      secondaryWalletId: companyCash.id,
      expected: [
        ["customer-wallet", "USER_SETTLEMENT", "-25.50"],
        ["company-cash", "CUSTOMER_GUARANTEE_FUNDS", "-25.50"],
      ],
    },
    {
      type: "REIMBURSEMENT",
      primaryWalletId: companyCash.id,
      secondaryWalletId: adminOneWallet.id,
      expected: [
        ["company-cash", "BUSINESS_FUNDS", "-25.50"],
        ["admin-one-wallet", "ADMIN_PERSONAL_FUNDS", "25.50"],
      ],
    },
    {
      type: "PERSONAL_EXTRACTION",
      primaryWalletId: adminOneWallet.id,
      secondaryWalletId: customerWallet.id,
      expected: [["admin-one-wallet", "ADMIN_PERSONAL_FUNDS", "-25.50"]],
    },
    {
      type: "PERSONAL_FUNDS_SPLIT",
      primaryWalletId: adminOneWallet.id,
      secondaryWalletId: adminTwoWallet.id,
      expected: [
        ["admin-one-wallet", "ADMIN_PERSONAL_FUNDS", "-25.50"],
        ["admin-two-wallet", "ADMIN_PERSONAL_FUNDS", "25.50"],
      ],
    },
    {
      type: "COMPANY_DISTRIBUTION",
      primaryWalletId: companyCash.id,
      secondaryWalletId: adminOneWallet.id,
      expected: [["company-cash", "BUSINESS_FUNDS", "-25.50"]],
    },
    {
      type: "REFUND",
      primaryWalletId: customerWallet.id,
      secondaryWalletId: companyCash.id,
      expected: [
        ["customer-wallet", "USER_SETTLEMENT", "-25.50"],
        ["company-cash", "BUSINESS_FUNDS", "-25.50"],
      ],
    },
    {
      type: "ADJUSTMENT",
      primaryWalletId: companyCash.id,
      direction: "NEGATIVE",
      expected: [["company-cash", "BUSINESS_FUNDS", "-25.50"]],
    },
  ] as const)(
    "builds the backend ledger shape for $type",
    ({ direction, expected, primaryWalletId, secondaryWalletId, type }) => {
      const form = formFor(type, {
        direction,
        primaryWalletId,
        secondaryWalletId,
      });
      const result = build(form);

      expect(result.errors).toEqual({});
      expect(result.input?.balanceChanges).toEqual(
        expected.map(([walletId, bucket, amountDelta]) => ({
          walletId,
          bucket,
          currency: "RON",
          amountDelta,
        })),
      );
      expect(
        v1.finance.createMoneyTransactionInputSchema.safeParse(result.input)
          .success,
      ).toBe(true);
    },
  );

  it("derives settlement participants from the selected wallet owners", () => {
    const result = build(
      formFor("PERSONAL_FUNDS_SPLIT", {
        primaryWalletId: adminOneWallet.id,
        secondaryWalletId: adminTwoWallet.id,
      }),
    );

    expect(result.input).toMatchObject({
      financialScope: "ADMIN_PERSONAL",
      paymentMethod: "CASH",
      debtorUserId: "admin-one",
      creditorUserId: "admin-two",
    });
  });

  it("keeps the same idempotency key when a form is rebuilt for retry", () => {
    const form = formFor("INCOME", {
      primaryWalletId: companyCash.id,
    });

    expect(build(form).input?.idempotencyKey).toBe("stable-test-key");
    expect(build(form).input?.idempotencyKey).toBe("stable-test-key");
  });

  it("prefills claim settlement wallets by debtor and creditor owner", () => {
    const state = createTransactionFormState(wallets, {
      type: "PERSONAL_FUNDS_SPLIT",
      amount: "44.20",
      currency: "eur",
      debtorUserId: "admin-one",
      creditorUserId: "admin-two",
    });

    expect(state).toMatchObject({
      amount: "44.20",
      currency: "eur",
      primaryWalletId: "admin-one-wallet",
      secondaryWalletId: "admin-two-wallet",
    });
  });

  it("rejects a two-sided workflow using the same wallet", () => {
    const result = build(
      formFor("TRANSFER", {
        primaryWalletId: companyCash.id,
        secondaryWalletId: companyCash.id,
      }),
    );

    expect(result.input).toBeUndefined();
    expect(result.errors.secondaryWalletId).toBe("different wallets");
  });

  it("allows one admin wallet to route different buckets when the backend does", () => {
    const result = build(
      formFor("REIMBURSEMENT", {
        primaryWalletId: adminOneWallet.id,
        secondaryWalletId: adminOneWallet.id,
      }),
    );

    expect(result.errors).toEqual({});
    expect(result.input?.balanceChanges).toEqual([
      {
        walletId: adminOneWallet.id,
        bucket: "BUSINESS_FUNDS",
        currency: "RON",
        amountDelta: "-25.50",
      },
      {
        walletId: adminOneWallet.id,
        bucket: "ADMIN_PERSONAL_FUNDS",
        currency: "RON",
        amountDelta: "25.50",
      },
    ]);
  });

  it("maps shared currency and description failures back to their controls", () => {
    const currencyResult = build(
      formFor("INCOME", {
        primaryWalletId: companyCash.id,
        currency: "RO",
      }),
    );
    const descriptionResult = build(
      formFor("INCOME", {
        primaryWalletId: companyCash.id,
        description: "x".repeat(2_001),
      }),
    );

    expect(currencyResult.input).toBeUndefined();
    expect(currencyResult.errors.currency).toBeTruthy();
    expect(descriptionResult.input).toBeUndefined();
    expect(descriptionResult.errors.description).toBeTruthy();
  });

  it.each(["INCOME", "EXPENSE"] as const)(
    "derives the optional %s counterparty from a user wallet",
    (type) => {
      const result = build(
        formFor(type, {
          primaryWalletId: companyCash.id,
          counterpartyWalletId: customerWallet.id,
        }),
      );

      expect(result.errors).toEqual({});
      expect(result.input?.counterpartyUserId).toBe("customer");
    },
  );

  it("leaves the income counterparty empty when no user is selected", () => {
    const result = build(
      formFor("INCOME", {
        primaryWalletId: companyCash.id,
      }),
    );

    expect(result.errors).toEqual({});
    expect(result.input?.counterpartyUserId).toBeNull();
  });
});

function build(form: TransactionFormState) {
  return buildTransactionInput(form, {
    idempotencyKey: "stable-test-key",
    wallets,
    requiredMessage: (field) => `${field} required`,
    differentWalletsMessage: "different wallets",
    differentPeopleMessage: "different people",
    referencePairMessage: "reference pair",
  });
}

function formFor(
  type: v1.finance.CreatableMoneyTransactionType,
  overrides: Partial<TransactionFormState>,
): TransactionFormState {
  return {
    ...createTransactionFormState(wallets, { type }),
    amount: "25.50",
    ...withoutUndefined(overrides),
  };
}

function wallet(
  id: string,
  type: v1.finance.WalletType,
  ownerId?: string,
): v1.finance.WalletOption {
  return {
    id,
    type,
    name: id,
    isActive: true,
    owner: ownerId
      ? {
          id: ownerId,
          email: `${ownerId}@example.com`,
          firstName: ownerId,
          lastName: null,
        }
      : null,
  };
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
