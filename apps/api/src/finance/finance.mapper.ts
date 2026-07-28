import { v1 } from "@repo/api-shared";

import type {
  FinancialCategory,
  MoneyTransaction,
  MoneyTransactionReference,
  User,
  Wallet,
  WalletBalance,
  WalletBalanceChange,
} from "../generated/prisma/client";

export type WalletWithDetails = Wallet & {
  owner: Pick<User, "id" | "email" | "firstName" | "lastName"> | null;
  balances: WalletBalance[];
};

export type MoneyTransactionWithDetails = MoneyTransaction & {
  balanceChanges: WalletBalanceChange[];
  references: MoneyTransactionReference[];
};

function money(value: { toFixed(decimalPlaces: number): string }): string {
  return value.toFixed(2);
}

export function toWallet(row: WalletWithDetails): v1.finance.Wallet {
  return {
    id: row.id,
    type: row.type,
    ownerUserId: row.ownerUserId,
    owner: row.owner
      ? {
          id: row.owner.id,
          email: row.owner.email,
          firstName: row.owner.firstName,
          lastName: row.owner.lastName,
        }
      : null,
    name: row.name,
    isActive: row.isActive,
    balances: row.balances.map((balance) => ({
      bucket: balance.bucket,
      currency: balance.currency,
      balance: money(balance.balance),
      updatedAt: balance.updatedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMoneyTransaction(
  row: MoneyTransactionWithDetails,
): v1.finance.MoneyTransaction {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    amount: money(row.amount),
    currency: row.currency,
    financialScope: row.financialScope,
    paymentMethod: row.paymentMethod,
    billingStatus: row.billingStatus,
    categoryId: row.categoryId,
    counterpartyUserId: row.counterpartyUserId,
    recipientUserId: row.recipientUserId,
    debtorUserId: row.debtorUserId,
    creditorUserId: row.creditorUserId,
    recordedByUserId: row.recordedByUserId,
    occurredAt: row.occurredAt.toISOString(),
    description: row.description,
    idempotencyKey: row.idempotencyKey,
    originTransactionId: row.originTransactionId,
    reversalOfTransactionId: row.reversalOfTransactionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    balanceChanges: row.balanceChanges.map((change) => ({
      id: change.id,
      walletId: change.walletId,
      bucket: change.bucket,
      currency: change.currency,
      amountDelta: money(change.amountDelta),
      createdAt: change.createdAt.toISOString(),
    })),
    references: row.references.map((reference) => ({
      id: reference.id,
      referenceType: reference.referenceType,
      referenceId: reference.referenceId,
      isPrimary: reference.isPrimary,
      createdAt: reference.createdAt.toISOString(),
    })),
  };
}

export function toFinancialCategory(
  row: FinancialCategory,
): v1.finance.FinancialCategory {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    parentCategoryId: row.parentCategoryId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
