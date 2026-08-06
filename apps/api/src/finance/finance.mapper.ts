import { v1 } from "@repo/api-shared";

import type {
  Company,
  Counterparty,
  FinancialCategory,
  MoneyTransaction,
  MoneyTransactionReference,
  Person,
  User,
  Wallet,
  WalletBalance,
  WalletBalanceChange,
} from "../generated/prisma/client";

export type WalletWithDetails = Wallet & {
  owner: Pick<User, "id" | "email" | "firstName" | "lastName"> | null;
  cardHolder: Pick<User, "id" | "email" | "firstName" | "lastName"> | null;
  balances: WalletBalance[];
};

type UserSummary = Pick<User, "id" | "email" | "firstName" | "lastName">;
type CategorySummary = Pick<FinancialCategory, "id" | "code" | "name" | "kind">;
type WalletSummary = Pick<Wallet, "id" | "type" | "name" | "ownerUserId"> & {
  owner: UserSummary | null;
};

type CounterpartySummary = Pick<Counterparty, "id" | "type"> & {
  person: Pick<Person, "email" | "firstName" | "lastName"> | null;
  company: Pick<Company, "legalForm" | "legalName"> | null;
};

export type MoneyTransactionWithDetails = MoneyTransaction & {
  category: CategorySummary | null;
  counterparty: UserSummary | null;
  counterpartyEntity: CounterpartySummary | null;
  recipient: UserSummary | null;
  recipientCounterparty: CounterpartySummary | null;
  debtor: UserSummary | null;
  debtorCounterparty: CounterpartySummary | null;
  creditor: UserSummary | null;
  creditorCounterparty: CounterpartySummary | null;
  recordedBy: UserSummary | null;
  balanceChanges: Array<
    WalletBalanceChange & {
      wallet: WalletSummary;
    }
  >;
  references: MoneyTransactionReference[];
  reversals: Array<Pick<MoneyTransaction, "id">>;
};

function money(value: { toFixed(decimalPlaces: number): string }): string {
  return value.toFixed(2);
}

function toUserSummary(row: UserSummary | null) {
  return row
    ? {
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
      }
    : null;
}

export function toCounterpartySummary(row: CounterpartySummary | null) {
  if (!row) return null;
  const personName = row.person
    ? [row.person.firstName, row.person.lastName].filter(Boolean).join(" ")
    : "";
  return {
    id: row.id,
    kind: row.type,
    label:
      (row.company?.legalName ?? personName) || row.person?.email || row.id,
  };
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
    cardHolderUserId: row.cardHolderUserId,
    cardHolder: toUserSummary(row.cardHolder),
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
    category: row.category
      ? {
          id: row.category.id,
          code: row.category.code,
          name: row.category.name,
          kind: row.category.kind,
        }
      : null,
    counterpartyUserId: row.counterpartyUserId,
    counterpartyId: row.counterpartyId,
    counterparty: toUserSummary(row.counterparty),
    counterpartyEntity: toCounterpartySummary(row.counterpartyEntity),
    recipientUserId: row.recipientUserId,
    recipientCounterpartyId: row.recipientCounterpartyId,
    recipient: toUserSummary(row.recipient),
    recipientCounterparty: toCounterpartySummary(row.recipientCounterparty),
    debtorUserId: row.debtorUserId,
    debtorCounterpartyId: row.debtorCounterpartyId,
    debtor: toUserSummary(row.debtor),
    debtorCounterparty: toCounterpartySummary(row.debtorCounterparty),
    creditorUserId: row.creditorUserId,
    creditorCounterpartyId: row.creditorCounterpartyId,
    creditor: toUserSummary(row.creditor),
    creditorCounterparty: toCounterpartySummary(row.creditorCounterparty),
    recordedByUserId: row.recordedByUserId,
    recordedBy: toUserSummary(row.recordedBy),
    occurredAt: row.occurredAt.toISOString(),
    description: row.description,
    idempotencyKey: row.idempotencyKey,
    originTransactionId: row.originTransactionId,
    reversalOfTransactionId: row.reversalOfTransactionId,
    reversalTransactionId: row.reversals[0]?.id ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    balanceChanges: row.balanceChanges.map((change) => ({
      id: change.id,
      walletId: change.walletId,
      wallet: {
        id: change.wallet.id,
        type: change.wallet.type,
        name: change.wallet.name,
        ownerUserId: change.wallet.ownerUserId,
        owner: toUserSummary(change.wallet.owner),
      },
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
    icon: row.icon,
    parentCategoryId: row.parentCategoryId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
