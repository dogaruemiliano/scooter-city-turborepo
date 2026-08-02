import type { v1 } from "@repo/api-shared";

import type { ExpensePaymentSource } from "./expense-form";

export interface ExpenseWalletOption {
  id: string;
  name: string;
  type: v1.finance.WalletType;
}

export interface ExpenseEntityOption {
  id: string;
  label: string;
  taxIdentifier: string | null;
  defaultCurrency: string;
  wallets: ExpenseWalletOption[];
}

export interface ExpenseUserOption {
  id: string;
  label: string;
  email: string;
}

export interface ExpenseOwnerOption {
  id: string;
  legalEntityId: string;
  userId: string;
  label: string;
  email: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ExpenseCategoryOption {
  id: string;
  label: string;
}

export interface ExpenseVatPeriodOption {
  id: string;
  legalEntityId: string;
  vatNumber: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ExpenseFormBootstrap {
  entities: ExpenseEntityOption[];
  users: ExpenseUserOption[];
  owners: ExpenseOwnerOption[];
  categories: ExpenseCategoryOption[];
  vatPeriods: ExpenseVatPeriodOption[];
  currentUserId: string;
  today: string;
}

export function walletsForExpenseSource(
  entity: ExpenseEntityOption | undefined,
  source: ExpensePaymentSource,
): ExpenseWalletOption[] {
  if (!entity || source === "PERSONAL_FUNDS") return [];

  return entity.wallets.filter((wallet) =>
    source === "COMPANY_CASH_DESK"
      ? wallet.type === "COMPANY_CASH"
      : wallet.type === "COMPANY_BANK" || wallet.type === "PAYMENT_PROCESSOR",
  );
}

export function activeExpenseOwners(
  owners: readonly ExpenseOwnerOption[],
  legalEntityId: string,
  on: string,
): ExpenseOwnerOption[] {
  return owners.filter(
    (owner) =>
      owner.legalEntityId === legalEntityId &&
      owner.effectiveFrom <= on &&
      (owner.effectiveTo === null || owner.effectiveTo > on),
  );
}

export function isVatRegisteredOn(
  periods: readonly ExpenseVatPeriodOption[],
  legalEntityId: string,
  on: string,
): boolean {
  return periods.some(
    (period) =>
      period.legalEntityId === legalEntityId &&
      period.effectiveFrom <= on &&
      (period.effectiveTo === null || period.effectiveTo > on),
  );
}
