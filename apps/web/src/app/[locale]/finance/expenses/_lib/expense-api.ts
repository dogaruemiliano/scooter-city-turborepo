/**
 * Browser-side calls for recording an expense.
 *
 * Both endpoints take the identical body. That is the design: preview runs
 * the server's posting policy and stops, create runs it and saves. The client
 * never computes a number of its own.
 */
import { v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";

export function previewExpense(
  input: v1.finance.CreateExpenseInput,
  signal?: AbortSignal,
): Promise<v1.finance.PostingPlan> {
  return webApi.fetch(
    v1.finance.ROUTES.expenses.preview,
    v1.finance.postingPlanSchema,
    { method: "POST", json: input, signal, cache: "no-store" },
  );
}

/**
 * Records the expense.
 *
 * The idempotency key is minted once per form attempt by the caller and
 * reused on retry, so a network timeout followed by a second submit returns
 * the original operation rather than recording the cost twice.
 */
export function createExpense(
  input: v1.finance.CreateExpenseInput,
  idempotencyKey: string,
): Promise<v1.finance.FinancialOperation> {
  return webApi.fetch(
    v1.finance.ROUTES.expenses.create,
    v1.finance.financialOperationSchema,
    {
      method: "POST",
      json: input,
      headers: { [v1.finance.IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    },
  );
}

export function reverseOperation(
  operationId: string,
  input: v1.finance.ReverseOperationInput,
  idempotencyKey: string,
): Promise<v1.finance.FinancialOperation> {
  return webApi.fetch(
    v1.finance.ROUTES.operations.reverse(operationId),
    v1.finance.financialOperationSchema,
    {
      method: "POST",
      json: input,
      headers: { [v1.finance.IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    },
  );
}

export function previewSettlement(
  input: v1.finance.PreviewSettlementInput,
  signal?: AbortSignal,
): Promise<v1.finance.SettlementPreview> {
  return webApi.fetch(
    v1.finance.ROUTES.settlements.preview,
    v1.finance.settlementPreviewSchema,
    { method: "POST", json: input, signal, cache: "no-store" },
  );
}
