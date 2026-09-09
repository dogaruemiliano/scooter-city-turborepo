/**
 * Financial-module shared constants and route helpers.
 *
 * Design reference: docs/finance/financial-system-architecture.md
 *
 * The enum tuples mirror the Prisma enums exactly. They are the single
 * source of truth for both the zod schemas here and the UI's option lists,
 * so a Prisma enum change surfaces as a type error rather than a runtime
 * surprise.
 */

export const FINANCE_BOOK_TYPES = ["COMPANY", "ASSOCIATE_POOL"] as const;

export type FinanceBookType = (typeof FINANCE_BOOK_TYPES)[number];

export const FINANCIAL_OPERATION_KINDS = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "ASSOCIATE_FUNDING",
  "REIMBURSEMENT",
  "PERSONAL_USE",
  "REVERSAL",
] as const;

export type FinancialOperationKind = (typeof FINANCIAL_OPERATION_KINDS)[number];

export const FINANCIAL_OPERATION_STATUSES = [
  "DRAFT",
  "POSTED",
  "REVERSED",
] as const;

export type FinancialOperationStatus =
  (typeof FINANCIAL_OPERATION_STATUSES)[number];

export const LEDGER_ACCOUNT_CATEGORIES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const;

export type LedgerAccountCategory = (typeof LEDGER_ACCOUNT_CATEGORIES)[number];

export const LEDGER_ACCOUNT_ROLES = [
  "BANK",
  "CASH_REGISTER",
  "COMPANY_CASH_CUSTODY",
  "ASSOCIATE_POOL_CASH_CUSTODY",
  "PAYABLE_TO_ASSOCIATE",
  "RECEIVABLE_FROM_ASSOCIATE",
  "ASSOCIATE_LOAN_PAYABLE",
  "CONTRIBUTED_CAPITAL",
  "OPERATING_EXPENSE",
  "NON_OPERATIONAL_COMPANY_EXPENSE",
  "ASSOCIATE_POOL_EXPENSE",
  "FIXED_ASSET",
  "RENTAL_REVENUE",
  "SCOOTER_SALE_REVENUE",
  "ASSOCIATE_POOL_REVENUE",
] as const;

export type LedgerAccountRole = (typeof LEDGER_ACCOUNT_ROLES)[number];

/**
 * The accounting category each role must carry. Mirrored by the
 * `LedgerAccount_role_category_valid` database constraint.
 */
export const LEDGER_ROLE_CATEGORY = {
  BANK: "ASSET",
  CASH_REGISTER: "ASSET",
  COMPANY_CASH_CUSTODY: "ASSET",
  ASSOCIATE_POOL_CASH_CUSTODY: "ASSET",
  PAYABLE_TO_ASSOCIATE: "LIABILITY",
  RECEIVABLE_FROM_ASSOCIATE: "ASSET",
  ASSOCIATE_LOAN_PAYABLE: "LIABILITY",
  CONTRIBUTED_CAPITAL: "EQUITY",
  OPERATING_EXPENSE: "EXPENSE",
  NON_OPERATIONAL_COMPANY_EXPENSE: "EXPENSE",
  ASSOCIATE_POOL_EXPENSE: "EXPENSE",
  FIXED_ASSET: "ASSET",
  RENTAL_REVENUE: "REVENUE",
  SCOOTER_SALE_REVENUE: "REVENUE",
  ASSOCIATE_POOL_REVENUE: "REVENUE",
} as const satisfies Record<LedgerAccountRole, LedgerAccountCategory>;

/**
 * Roles whose accounts belong to one associate. Company cash custody is an
 * associate-scoped *company asset* — it is not the associate's own money.
 */
export const ASSOCIATE_SCOPED_LEDGER_ROLES = [
  "COMPANY_CASH_CUSTODY",
  "ASSOCIATE_POOL_CASH_CUSTODY",
  "PAYABLE_TO_ASSOCIATE",
  "RECEIVABLE_FROM_ASSOCIATE",
  "ASSOCIATE_LOAN_PAYABLE",
] as const satisfies readonly LedgerAccountRole[];

/** Asset roles an expense may be paid from directly. */
export const EXPENSE_PAYMENT_SOURCE_ROLES = [
  "BANK",
  "CASH_REGISTER",
  "COMPANY_CASH_CUSTODY",
  "ASSOCIATE_POOL_CASH_CUSTODY",
] as const satisfies readonly LedgerAccountRole[];

export const EXPENSE_TREATMENTS = [
  "OPERATING_EXPENSE",
  "NON_OPERATIONAL_COMPANY_EXPENSE",
  "CAPITAL_ASSET",
  "ASSOCIATE_POOL_EXPENSE",
] as const;

export type ExpenseTreatment = (typeof EXPENSE_TREATMENTS)[number];

/** Expense treatments allowed in each conceptual finance book. */
export const EXPENSE_TREATMENTS_BY_BOOK_TYPE: Record<
  FinanceBookType,
  readonly ExpenseTreatment[]
> = {
  COMPANY: [
    "OPERATING_EXPENSE",
    "NON_OPERATIONAL_COMPANY_EXPENSE",
    "CAPITAL_ASSET",
  ],
  ASSOCIATE_POOL: ["ASSOCIATE_POOL_EXPENSE"],
};

/** The ledger role each treatment debits. */
export const EXPENSE_TREATMENT_DEBIT_ROLE = {
  OPERATING_EXPENSE: "OPERATING_EXPENSE",
  NON_OPERATIONAL_COMPANY_EXPENSE: "NON_OPERATIONAL_COMPANY_EXPENSE",
  CAPITAL_ASSET: "FIXED_ASSET",
  ASSOCIATE_POOL_EXPENSE: "ASSOCIATE_POOL_EXPENSE",
} as const satisfies Record<ExpenseTreatment, LedgerAccountRole>;

/**
 * Treatments that participate in company-benefit settlement. Capital assets
 * are excluded in v1 — the money became an asset, not a consumed benefit.
 */
export const SETTLED_EXPENSE_TREATMENTS = [
  "OPERATING_EXPENSE",
  "NON_OPERATIONAL_COMPANY_EXPENSE",
] as const satisfies readonly ExpenseTreatment[];

export const EXPENSE_PAYMENT_SOURCE_TYPES = [
  "BOOK_ACCOUNT",
  "ASSOCIATE_PERSONAL_FUNDS",
] as const;

export type ExpensePaymentSourceType =
  (typeof EXPENSE_PAYMENT_SOURCE_TYPES)[number];

export const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "ONLINE",
  "OTHER",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ECONOMIC_ALLOCATION_TYPES = [
  "COMMON",
  "ASSOCIATE_SPECIFIC",
] as const;

export type EconomicAllocationType = (typeof ECONOMIC_ALLOCATION_TYPES)[number];

export const INCOME_TYPES = ["RENTAL", "SCOOTER_SALE"] as const;

export type IncomeType = (typeof INCOME_TYPES)[number];

export const ASSOCIATE_FUNDING_TYPES = [
  "LOAN",
  "CAPITAL_CONTRIBUTION",
] as const;

export type AssociateFundingType = (typeof ASSOCIATE_FUNDING_TYPES)[number];

export const REIMBURSEMENT_TYPES = [
  "EXPENSE_ADVANCE_REPAYMENT",
  "ASSOCIATE_LOAN_REPAYMENT",
  "ASSOCIATE_RECEIVABLE_REPAYMENT",
] as const;

export type ReimbursementType = (typeof REIMBURSEMENT_TYPES)[number];

export const COST_OBJECT_TYPES = [
  "SCOOTER",
  "VEHICLE",
  "PROPERTY",
  "OFFICE",
  "FLEET",
  "EQUIPMENT",
  "OTHER",
] as const;

export type CostObjectType = (typeof COST_OBJECT_TYPES)[number];

export const COST_OBJECT_OWNERSHIP_TYPES = [
  "COMPANY",
  "ASSOCIATE",
  "SHARED",
  "EXTERNAL",
] as const;

export type CostObjectOwnershipType =
  (typeof COST_OBJECT_OWNERSHIP_TYPES)[number];

export const FINANCIAL_DOCUMENT_TYPES = [
  "RECEIPT",
  "INVOICE",
  "CONTRACT",
  "OTHER",
] as const;

export type FinancialDocumentType = (typeof FINANCIAL_DOCUMENT_TYPES)[number];

export const SETTLEMENT_RUN_KINDS = [
  "COMPANY_SPECIFIC_BENEFIT",
  "ASSOCIATE_POOL_CASH",
] as const;

export type SettlementRunKind = (typeof SETTLEMENT_RUN_KINDS)[number];

export const SETTLEMENT_RUN_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "CANCELLED",
] as const;

export type SettlementRunStatus = (typeof SETTLEMENT_RUN_STATUSES)[number];

export const SETTLEMENT_TRANSFER_STATUSES = [
  "PENDING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type SettlementTransferStatus =
  (typeof SETTLEMENT_TRANSFER_STATUSES)[number];

export const EXPENSE_EXTRACTION_DRAFT_STATUSES = [
  "ANALYZING",
  "READY",
  "FAILED",
  "CONFIRMED",
] as const;

export type ExpenseExtractionDraftStatus =
  (typeof EXPENSE_EXTRACTION_DRAFT_STATUSES)[number];

export const COMPANY_MATCH_STATUSES = [
  "MATCHED",
  "MISMATCHED",
  "UNKNOWN",
] as const;

export type CompanyMatchStatus = (typeof COMPANY_MATCH_STATUSES)[number];

/**
 * Header carrying the client command identifier for every financial write.
 * Retrying with the same key returns the original operation instead of
 * creating a second one.
 */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** Ownership shares are basis points of a whole book. */
export const TOTAL_SHARE_BASIS_POINTS = 10_000;

/** Minor units per major unit for every currency this module handles. */
export const MINOR_UNITS_PER_MAJOR = 100;

export const ROUTES = {
  books: "/v1/finance/books",
  companyIdentity: "/v1/finance/company-identity",
  companyAssociates: "/v1/finance/company-associates",
  suppliers: {
    list: "/v1/finance/suppliers",
    create: "/v1/finance/suppliers",
    update: (supplierId: string): string =>
      `/v1/finance/suppliers/${encodeURIComponent(supplierId)}`,
  },
  accounts: {
    list: "/v1/finance/accounts",
    /** Accounts with balances summed from their journal postings. */
    balances: "/v1/finance/account-balances",
    get: (accountId: string): string => `/v1/finance/accounts/${accountId}`,
    balance: (accountId: string): string =>
      `/v1/finance/accounts/${accountId}/balance`,
  },
  operations: {
    list: "/v1/finance/operations",
    get: (operationId: string): string =>
      `/v1/finance/operations/${operationId}`,
    reverse: (operationId: string): string =>
      `/v1/finance/operations/${operationId}/reverse`,
  },
  expenses: {
    preview: "/v1/finance/expenses/preview",
    create: "/v1/finance/expenses",
    draftUpload: "/v1/finance/expenses/receipt-draft-upload-url",
    analyze: "/v1/finance/expenses/extractions",
    extraction: (draftId: string): string =>
      `/v1/finance/expenses/extractions/${encodeURIComponent(draftId)}`,
  },
  funding: {
    preview: "/v1/finance/funding/preview",
    create: "/v1/finance/funding",
    draftUpload: "/v1/finance/funding/proof-draft-upload-url",
  },
  expenseCategories: {
    list: "/v1/finance/expense-categories",
    create: "/v1/finance/expense-categories",
  },
  costObjects: {
    list: "/v1/finance/cost-objects",
    create: "/v1/finance/cost-objects",
    update: (costObjectId: string): string =>
      `/v1/finance/cost-objects/${costObjectId}`,
  },
  settlements: {
    preview: "/v1/finance/settlements/preview",
  },
} as const;
