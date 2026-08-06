export const SCOOTER_SALE_STATUSES = [
  "OPEN",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
] as const;

export type ScooterSaleStatus = (typeof SCOOTER_SALE_STATUSES)[number];

export const SCOOTER_SALE_ROUTES = {
  list: "/v1/finance/scooter-sales",
  create: "/v1/finance/scooter-sales",
  get: (id: string): string => `/v1/finance/scooter-sales/${id}`,
  recordPayment: (id: string): string =>
    `/v1/finance/scooter-sales/${id}/payments`,
  cancel: (id: string): string => `/v1/finance/scooter-sales/${id}/cancel`,
  scooterFinancials: (scooterId: string): string =>
    `/v1/finance/scooters/${scooterId}/financials`,
  document: {
    get: (saleId: string): string =>
      `/v1/finance/scooter-sales/${saleId}/document`,
    upsert: (saleId: string): string =>
      `/v1/finance/scooter-sales/${saleId}/document`,
    uploadUrl: (saleId: string): string =>
      `/v1/finance/scooter-sales/${saleId}/document/upload-url`,
    completeUpload: (saleId: string): string =>
      `/v1/finance/scooter-sales/${saleId}/document/complete-upload`,
    content: (saleId: string): string =>
      `/v1/finance/scooter-sales/${saleId}/document/content`,
  },
} as const;
