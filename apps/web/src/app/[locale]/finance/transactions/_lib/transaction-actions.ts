import type { v1 } from "@repo/api-shared";

export interface TransactionActions {
  canPost: boolean;
  canReverse: boolean;
}

export function availableTransactionActions(
  transaction: Pick<v1.finance.MoneyTransaction, "status" | "type">,
): TransactionActions {
  return {
    canPost: transaction.status === "DRAFT",
    canReverse:
      transaction.status === "POSTED" &&
      transaction.type !== "PERSONAL_FUNDS_CLAIM",
  };
}
