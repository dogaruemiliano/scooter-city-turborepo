export const EXPENSE_STATUSES = ["DRAFT", "POSTED", "REVERSED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_PAYMENT_SOURCES = [
  "COMPANY_CARD",
  "COMPANY_CASH_DESK",
  "PERSONAL_FUNDS",
] as const;
export type ExpensePaymentSource = (typeof EXPENSE_PAYMENT_SOURCES)[number];

export const EXPENSE_FUNDING_TREATMENTS = [
  "REIMBURSABLE",
  "NON_REIMBURSABLE",
] as const;
export type ExpenseFundingTreatment =
  (typeof EXPENSE_FUNDING_TREATMENTS)[number];

export const EXPENSE_ATTRIBUTION_TARGETS = ["BUSINESS", "OWNER"] as const;
export type ExpenseAttributionTarget =
  (typeof EXPENSE_ATTRIBUTION_TARGETS)[number];

export const EXPENSE_DOCUMENT_TYPES = [
  "FISCAL_RECEIPT",
  "INVOICE",
  "POS_RECEIPT",
  "CREDIT_NOTE",
  "OTHER",
] as const;
export type ExpenseDocumentType = (typeof EXPENSE_DOCUMENT_TYPES)[number];

export const EXPENSE_DOCUMENT_REVIEW_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
] as const;
export type ExpenseDocumentReviewStatus =
  (typeof EXPENSE_DOCUMENT_REVIEW_STATUSES)[number];

export const EXPENSE_BUYER_CUI_STATUSES = [
  "NOT_REVIEWED",
  "MATCHED",
  "MISSING",
  "MISMATCH",
  "NOT_APPLICABLE",
] as const;
export type ExpenseBuyerCuiStatus = (typeof EXPENSE_BUYER_CUI_STATUSES)[number];

export const EXPENSE_DOCUMENT_ASSET_ROLES = ["ORIGINAL", "NORMALIZED"] as const;
export type ExpenseDocumentAssetRole =
  (typeof EXPENSE_DOCUMENT_ASSET_ROLES)[number];

export const EXPENSE_DOCUMENT_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type ExpenseDocumentContentType =
  (typeof EXPENSE_DOCUMENT_CONTENT_TYPES)[number];

export const EXPENSE_POSTING_ROLES = [
  "EXPENSE_PAYMENT",
  "EXPENSE_REVERSAL",
  "REIMBURSEMENT_SETTLEMENT",
] as const;
export type ExpensePostingRole = (typeof EXPENSE_POSTING_ROLES)[number];

export const EXPENSE_REIMBURSEMENT_STATUSES = [
  "OPEN",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "CANCELLED",
] as const;
export type ExpenseReimbursementStatus =
  (typeof EXPENSE_REIMBURSEMENT_STATUSES)[number];

export const EXPENSE_USER_OPTION_PURPOSES = [
  "PAYMENT_ACTOR",
  "BUSINESS_OWNER",
] as const;
export type ExpenseUserOptionPurpose =
  (typeof EXPENSE_USER_OPTION_PURPOSES)[number];

export const EXPENSE_ROUTES = {
  legalEntities: {
    list: "/v1/finance/business-legal-entities",
    create: "/v1/finance/business-legal-entities",
    get: (entityId: string): string =>
      `/v1/finance/business-legal-entities/${entityId}`,
    update: (entityId: string): string =>
      `/v1/finance/business-legal-entities/${entityId}`,
    owners: {
      list: (entityId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/owners`,
      create: (entityId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/owners`,
      update: (entityId: string, ownerId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/owners/${ownerId}`,
      delete: (entityId: string, ownerId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/owners/${ownerId}`,
    },
    vatPeriods: {
      list: (entityId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/vat-periods`,
      create: (entityId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/vat-periods`,
      update: (entityId: string, periodId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/vat-periods/${periodId}`,
      delete: (entityId: string, periodId: string): string =>
        `/v1/finance/business-legal-entities/${entityId}/vat-periods/${periodId}`,
    },
  },
  list: "/v1/finance/expenses",
  create: "/v1/finance/expenses",
  get: (expenseId: string): string => `/v1/finance/expenses/${expenseId}`,
  update: (expenseId: string): string => `/v1/finance/expenses/${expenseId}`,
  post: (expenseId: string): string => `/v1/finance/expenses/${expenseId}/post`,
  reverse: (expenseId: string): string =>
    `/v1/finance/expenses/${expenseId}/reverse`,
  documents: {
    list: (expenseId: string): string =>
      `/v1/finance/expenses/${expenseId}/documents`,
    create: (expenseId: string): string =>
      `/v1/finance/expenses/${expenseId}/documents`,
    get: (expenseId: string, documentId: string): string =>
      `/v1/finance/expenses/${expenseId}/documents/${documentId}`,
    update: (expenseId: string, documentId: string): string =>
      `/v1/finance/expenses/${expenseId}/documents/${documentId}`,
    delete: (expenseId: string, documentId: string): string =>
      `/v1/finance/expenses/${expenseId}/documents/${documentId}`,
    uploadUrl: (
      expenseId: string,
      documentId: string,
      role: ExpenseDocumentAssetRole,
    ): string =>
      `/v1/finance/expenses/${expenseId}/documents/${documentId}/assets/${role}/upload-url`,
    completeUpload: (
      expenseId: string,
      documentId: string,
      role: ExpenseDocumentAssetRole,
    ): string =>
      `/v1/finance/expenses/${expenseId}/documents/${documentId}/assets/${role}/complete-upload`,
    content: (
      expenseId: string,
      documentId: string,
      role: ExpenseDocumentAssetRole,
    ): string =>
      `/v1/finance/expenses/${expenseId}/documents/${documentId}/assets/${role}/content`,
  },
  options: {
    entities: "/v1/finance/expenses/options/entities",
    users: "/v1/finance/expenses/options/users",
    owners: "/v1/finance/expenses/options/owners",
    vatPeriods: "/v1/finance/expenses/options/vat-periods",
  },
  reimbursements: {
    list: "/v1/finance/expense-reimbursements",
    settle: (claimId: string): string =>
      `/v1/finance/expense-reimbursements/${claimId}/settlements`,
  },
  reports: {
    attribution: "/v1/finance/expense-reports/attribution",
    reimbursements: "/v1/finance/expense-reports/reimbursements",
    paymentSources: "/v1/finance/expense-reports/payment-sources",
    documentReview: "/v1/finance/expense-reports/document-review",
  },
} as const;

export function expenseFundingTreatmentFor(
  source: ExpensePaymentSource,
  target: ExpenseAttributionTarget,
): ExpenseFundingTreatment {
  return source === "PERSONAL_FUNDS" && target === "BUSINESS"
    ? "REIMBURSABLE"
    : "NON_REIMBURSABLE";
}

export function isExpensePaymentCombinationAllowed(
  source: ExpensePaymentSource,
  target: ExpenseAttributionTarget,
): boolean {
  return (
    EXPENSE_PAYMENT_SOURCES.includes(source) &&
    EXPENSE_ATTRIBUTION_TARGETS.includes(target)
  );
}
