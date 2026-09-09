/**
 * Bridges the HTTP contract to the domain command, and decides when two
 * requests carrying the same idempotency key are "the same request".
 */
import type { v1 } from "@repo/api-shared";

import type {
  EconomicAllocationCommand,
  ExpenseCommand,
  ExpensePaymentCommand,
} from "../../domain/finance.types";
import type { OperationRecord } from "../../infrastructure/prisma-finance.repository";

/** Strips the transport shape down to what the posting policy needs. */
export function toExpenseCommand(
  input: v1.finance.CreateExpenseInput,
): ExpenseCommand {
  return {
    bookId: input.bookId,
    amountMinor: input.amountMinor,
    treatment: input.treatment,
    description: input.description ?? null,
    payments: input.payments.map(toPaymentCommand),
    allocations: input.allocations.map(toAllocationCommand),
  };
}

function toPaymentCommand(
  payment: v1.finance.ExpensePaymentInput,
): ExpensePaymentCommand {
  return payment.sourceType === "BOOK_ACCOUNT"
    ? {
        sourceType: "BOOK_ACCOUNT",
        sourceAccountId: payment.sourceAccountId,
        paymentMethod: payment.paymentMethod,
        amountMinor: payment.amountMinor,
      }
    : {
        sourceType: "ASSOCIATE_PERSONAL_FUNDS",
        payerAssociateId: payment.payerAssociateId,
        paymentMethod: payment.paymentMethod,
        amountMinor: payment.amountMinor,
      };
}

function toAllocationCommand(
  allocation: v1.finance.EconomicAllocationInput,
): EconomicAllocationCommand {
  return allocation.type === "COMMON"
    ? { type: "COMMON", amountMinor: allocation.amountMinor }
    : {
        type: "ASSOCIATE_SPECIFIC",
        associateId: allocation.associateId,
        amountMinor: allocation.amountMinor,
      };
}

/**
 * A stable summary of everything financially meaningful about an expense.
 *
 * Retrying a request must return the original operation; reusing a key for a
 * *different* expense must be refused. Comparing fingerprints tells the two
 * apart without storing an extra hash column.
 *
 * Line order does not matter — the same three payments listed in a different
 * order is the same expense — so lines are sorted before joining.
 *
 * Document metadata is excluded on purpose. A receipt reference added on a
 * retry describes the same expense; it should return the original operation
 * rather than be refused as a conflict.
 */
export function fingerprintExpenseInput(
  input: v1.finance.CreateExpenseInput,
): string {
  const payments = input.payments
    .map((payment) =>
      [
        payment.sourceType,
        payment.sourceType === "BOOK_ACCOUNT"
          ? payment.sourceAccountId
          : payment.payerAssociateId,
        payment.paymentMethod,
        payment.amountMinor,
      ].join(":"),
    )
    .sort();

  const allocations = input.allocations
    .map((allocation) =>
      [
        allocation.type,
        allocation.type === "ASSOCIATE_SPECIFIC" ? allocation.associateId : "",
        allocation.amountMinor,
      ].join(":"),
    )
    .sort();

  return [
    input.bookId,
    new Date(input.occurredAt).toISOString(),
    input.amountMinor,
    input.treatment,
    input.categoryId,
    input.costObjectId ?? "",
    input.supplierId ?? "",
    input.extractionDraftId ?? "",
    payments.join("|"),
    allocations.join("|"),
  ].join("//");
}

/** The same fingerprint, computed from what was actually stored. */
export function fingerprintStoredExpense(row: OperationRecord): string {
  if (!row.expense) return "";

  const payments = row.expense.payments
    .map((payment) =>
      [
        payment.sourceType,
        payment.sourceAccountId ?? payment.payerAssociateId ?? "",
        payment.paymentMethod,
        payment.amountMinor,
      ].join(":"),
    )
    .sort();

  const allocations = row.allocations
    .map((allocation) =>
      [
        allocation.type,
        allocation.associateId ?? "",
        allocation.amountMinor,
      ].join(":"),
    )
    .sort();

  return [
    row.bookId,
    row.occurredAt.toISOString(),
    row.expense.amountMinor,
    row.expense.treatment,
    row.expense.categoryId,
    row.expense.costObjectId ?? "",
    row.expense.supplierId ?? "",
    row.expenseExtractionDraft?.id ?? "",
    payments.join("|"),
    allocations.join("|"),
  ].join("//");
}
