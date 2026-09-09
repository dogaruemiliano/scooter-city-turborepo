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

export function createSupplier(
  input: v1.finance.CreateSupplierInput,
): Promise<v1.finance.Supplier> {
  return webApi.fetch(
    v1.finance.ROUTES.suppliers.create,
    v1.finance.supplierSchema,
    { method: "POST", json: input },
  );
}

export function updateSupplier(
  supplierId: string,
  input: v1.finance.UpdateSupplierInput,
): Promise<v1.finance.Supplier> {
  return webApi.fetch(
    v1.finance.ROUTES.suppliers.update(supplierId),
    v1.finance.supplierSchema,
    { method: "PATCH", json: input },
  );
}

export async function analyzeExpenseReceipt(
  file: File,
): Promise<v1.finance.ExpenseExtractionDraft> {
  const uploadToken = await uploadExpenseReceipt(file);

  return webApi.fetch(
    v1.finance.ROUTES.expenses.analyze,
    v1.finance.expenseExtractionDraftSchema,
    {
      method: "POST",
      json: { uploadToken },
    },
  );
}

/**
 * Uploads private receipt evidence without starting Textract.
 *
 * The returned signed token, rather than the storage key, is sent when the
 * expense is finally recorded. That keeps the browser from choosing which
 * private object is attached to a financial operation.
 */
export async function uploadExpenseReceipt(file: File): Promise<string> {
  const checksum = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const checksumSha256 = Array.from(new Uint8Array(checksum), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  const signed = await webApi.fetch(
    v1.finance.ROUTES.expenses.draftUpload,
    v1.finance.expenseReceiptDraftUploadSchema,
    {
      method: "POST",
      json: {
        contentType: file.type,
        byteSize: file.size,
        checksumSha256,
      },
    },
  );

  const upload = await fetch(signed.uploadUrl, {
    method: signed.method,
    headers: signed.headers,
    body: file,
  });
  if (!upload.ok) {
    throw new Error(`Storage upload returned HTTP ${upload.status}`);
  }

  return signed.uploadToken;
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
