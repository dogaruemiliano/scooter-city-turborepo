"use client";

import { v1 } from "@repo/api-shared";

import { webApi } from "@/lib/api";

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
