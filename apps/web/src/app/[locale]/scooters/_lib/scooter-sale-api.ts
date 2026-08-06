"use client";

import { ApiError, v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";
import {
  prepareFileEvidence,
  type SelectedFileEvidence,
} from "@/lib/file-evidence";

export const SCOOTER_SALE_BILL_MAX_BYTES = 10 * 1_024 * 1_024;
export const SCOOTER_SALE_BILL_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export async function getScooterFinancials(
  scooterId: string,
): Promise<v1.finance.ScooterFinancials> {
  return webApi.fetch(
    v1.finance.SCOOTER_SALE_ROUTES.scooterFinancials(scooterId),
    v1.finance.scooterFinancialsSchema,
    { cache: "no-store" },
  );
}

export async function sellScooter(
  input: v1.finance.CreateScooterSaleInput,
): Promise<v1.finance.ScooterSale> {
  return webApi.fetch(
    v1.finance.SCOOTER_SALE_ROUTES.create,
    v1.finance.scooterSaleSchema,
    { method: "POST", json: input },
  );
}

export async function recordScooterSalePayment(
  scooterSaleId: string,
  input: v1.finance.RecordScooterSalePaymentInput,
): Promise<v1.finance.ScooterSale> {
  return webApi.fetch(
    v1.finance.SCOOTER_SALE_ROUTES.recordPayment(scooterSaleId),
    v1.finance.scooterSaleSchema,
    { method: "POST", json: input },
  );
}

export async function cancelScooterSale(
  scooterSaleId: string,
): Promise<v1.finance.ScooterSale> {
  return webApi.fetch(
    v1.finance.SCOOTER_SALE_ROUTES.cancel(scooterSaleId),
    v1.finance.scooterSaleSchema,
    { method: "POST", json: {} },
  );
}

export async function getPersonalOwnerOptions(): Promise<
  v1.finance.OwnerBalance[]
> {
  const result = await webApi.fetch(
    v1.finance.ROUTES.owners.balances,
    v1.finance.ownerBalanceListSchema,
    { cache: "no-store" },
  );
  return result.items;
}

export async function getScooterSaleDocument(
  scooterSaleId: string,
): Promise<v1.finance.ScooterSaleDocument | null> {
  try {
    return await webApi.fetch(
      v1.finance.SCOOTER_SALE_ROUTES.document.get(scooterSaleId),
      v1.finance.scooterSaleDocumentSchema,
      { cache: "no-store" },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function upsertScooterSaleDocument(
  scooterSaleId: string,
  input: v1.finance.UpsertScooterSaleDocumentInput,
): Promise<v1.finance.ScooterSaleDocument> {
  return webApi.fetch(
    v1.finance.SCOOTER_SALE_ROUTES.document.upsert(scooterSaleId),
    v1.finance.scooterSaleDocumentSchema,
    { method: "PUT", json: input },
  );
}

export async function prepareScooterSaleBill(
  file: File,
): Promise<SelectedFileEvidence> {
  return prepareFileEvidence(file, {
    allowedContentTypes: SCOOTER_SALE_BILL_CONTENT_TYPES,
    maxBytes: SCOOTER_SALE_BILL_MAX_BYTES,
  });
}

export async function uploadScooterSaleBill(
  scooterSaleId: string,
  evidence: SelectedFileEvidence,
): Promise<v1.finance.ScooterSaleDocument> {
  const uploadInput =
    v1.finance.createScooterSaleDocumentUploadUrlInputSchema.parse({
      contentType: evidence.contentType,
      byteSize: evidence.byteSize,
      checksumSha256: evidence.sha256,
      ...(evidence.contentType === "application/pdf"
        ? { pageCount: evidence.pageCount }
        : {
            imageWidth: evidence.imageWidth,
            imageHeight: evidence.imageHeight,
          }),
    });
  const signedUpload = await webApi.fetch(
    v1.finance.SCOOTER_SALE_ROUTES.document.uploadUrl(scooterSaleId),
    v1.finance.scooterSaleDocumentUploadUrlSchema,
    { method: "POST", json: uploadInput },
  );
  const uploadResponse = await fetch(signedUpload.uploadUrl, {
    method: signedUpload.method,
    headers: signedUpload.headers,
    body: evidence.file,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Bill upload failed with HTTP ${uploadResponse.status}.`);
  }

  return webApi.fetch(
    v1.finance.SCOOTER_SALE_ROUTES.document.completeUpload(scooterSaleId),
    v1.finance.scooterSaleDocumentSchema,
    {
      method: "POST",
      json: v1.finance.completeScooterSaleDocumentUploadInputSchema.parse({
        uploadToken: signedUpload.uploadToken,
      }),
    },
  );
}

export async function searchScooterBuyers(
  search: string,
  signal?: AbortSignal,
): Promise<v1.finance.FinancialCounterpartySearchResult> {
  const params = new URLSearchParams({
    search,
    kind: "PERSON",
    transactionType: "INCOME",
    pageSize: "20",
  });
  return webApi.fetch(
    `${v1.finance.ROUTES.counterparties.search}?${params}`,
    v1.finance.financialCounterpartySearchResultSchema,
    { cache: "no-store", signal },
  );
}
