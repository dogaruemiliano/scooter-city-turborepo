export const WALLET_TYPES = [
  "USER",
  "COMPANY_CASH",
  "COMPANY_BANK",
  "PAYMENT_PROCESSOR",
] as const;

export type WalletType = (typeof WALLET_TYPES)[number];

export const COMPANY_WALLET_TYPES = [
  "COMPANY_CASH",
  "COMPANY_BANK",
  "PAYMENT_PROCESSOR",
] as const satisfies readonly WalletType[];

export type CompanyWalletType = (typeof COMPANY_WALLET_TYPES)[number];

export const WALLET_BALANCE_BUCKETS = [
  "USER_SETTLEMENT",
  "BUSINESS_FUNDS",
  "ADMIN_PERSONAL_FUNDS",
  "CUSTOMER_GUARANTEE_FUNDS",
] as const;

export type WalletBalanceBucket = (typeof WALLET_BALANCE_BUCKETS)[number];

export const MONEY_TRANSACTION_TYPES = [
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "USER_CHARGE",
  "USER_PAYMENT",
  "GUARANTEE_RECEIVED",
  "GUARANTEE_REFUNDED",
  "REIMBURSEMENT",
  "PERSONAL_EXTRACTION",
  "PERSONAL_FUNDS_SPLIT",
  "PERSONAL_FUNDS_CLAIM",
  "COMPANY_DISTRIBUTION",
  "REFUND",
  "ADJUSTMENT",
  "REVERSAL",
] as const;

export type MoneyTransactionType = (typeof MONEY_TRANSACTION_TYPES)[number];

export const CREATABLE_MONEY_TRANSACTION_TYPES = [
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "USER_CHARGE",
  "USER_PAYMENT",
  "GUARANTEE_RECEIVED",
  "GUARANTEE_REFUNDED",
  "REIMBURSEMENT",
  "PERSONAL_EXTRACTION",
  "PERSONAL_FUNDS_SPLIT",
  "COMPANY_DISTRIBUTION",
  "REFUND",
  "ADJUSTMENT",
] as const satisfies readonly MoneyTransactionType[];

export type CreatableMoneyTransactionType =
  (typeof CREATABLE_MONEY_TRANSACTION_TYPES)[number];

export const MONEY_TRANSACTION_STATUSES = [
  "DRAFT",
  "POSTED",
  "REVERSED",
] as const;

export type MoneyTransactionStatus =
  (typeof MONEY_TRANSACTION_STATUSES)[number];

export const MONEY_TRANSACTION_SCOPES = [
  "COMPANY",
  "ADMIN_PERSONAL",
  "CUSTOMER_HELD",
] as const;

export type MoneyTransactionScope = (typeof MONEY_TRANSACTION_SCOPES)[number];

export const PAYMENT_METHODS = [
  "CASH",
  "POS",
  "BANK_TRANSFER",
  "ONLINE_PAYMENT",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BILLING_STATUSES = [
  "BILLED",
  "NOT_BILLED",
  "NOT_APPLICABLE",
] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const FINANCIAL_CATEGORY_KINDS = ["INCOME", "EXPENSE"] as const;

export type FinancialCategoryKind = (typeof FINANCIAL_CATEGORY_KINDS)[number];

/**
 * Curated Lucide icon names selectable for a financial category. Stored as a
 * plain string column, so this list can grow without a migration; keep it in
 * sync with the icon lookup map consumed on the client.
 */
export const FINANCIAL_CATEGORY_ICONS = [
  "wrench",
  "truck",
  "fuel",
  "shield",
  "receipt",
  "wallet",
  "bike",
  "zap",
  "tag",
  "building-2",
  "users",
  "banknote",
  "car",
  "package",
  "phone",
  "wifi",
  "home",
  "heart",
  "gift",
  "megaphone",
  "credit-card",
  "piggy-bank",
  "alert-triangle",
  "scale",
  "graduation-cap",
  "file-text",
] as const;

export type FinancialCategoryIcon = (typeof FINANCIAL_CATEGORY_ICONS)[number];

export const FINANCIAL_COUNTERPARTY_KINDS = ["PERSON", "COMPANY"] as const;

export type FinancialCounterpartyKind =
  (typeof FINANCIAL_COUNTERPARTY_KINDS)[number];

export const COMPANY_LEGAL_FORMS = [
  "SRL",
  "SA",
  "PFA",
  "II",
  "IF",
  "ONG",
  "OTHER",
] as const;

export type CompanyLegalForm = (typeof COMPANY_LEGAL_FORMS)[number];

export const COMPANY_ACTIVITY_PERIODS = [
  "DAY",
  "WEEK",
  "MONTH",
  "YEAR",
  "ALL",
] as const;

export type CompanyActivityPeriod = (typeof COMPANY_ACTIVITY_PERIODS)[number];

export const ROUTES = {
  summary: "/v1/finance/summary",
  walletOptions: "/v1/finance/wallet-options",
  wallets: {
    list: "/v1/finance/wallets",
    create: "/v1/finance/wallets",
    get: (id: string): string => `/v1/finance/wallets/${id}`,
    mine: "/v1/finance/me/wallet",
  },
  categories: {
    list: "/v1/finance/categories",
    create: "/v1/finance/categories",
    update: (id: string): string => `/v1/finance/categories/${id}`,
  },
  counterparties: {
    search: "/v1/finance/counterparties/search",
  },
  companies: {
    list: "/v1/finance/companies",
    create: "/v1/finance/companies",
    get: (id: string): string => `/v1/finance/companies/${id}`,
    update: (id: string): string => `/v1/finance/companies/${id}`,
    stats: (id: string): string => `/v1/finance/companies/${id}/stats`,
  },
  transactions: {
    list: "/v1/finance/transactions",
    create: "/v1/finance/transactions",
    get: (id: string): string => `/v1/finance/transactions/${id}`,
    post: (id: string): string => `/v1/finance/transactions/${id}/post`,
    reverse: (id: string): string => `/v1/finance/transactions/${id}/reverse`,
  },
  claims: {
    outstanding: "/v1/finance/claims/outstanding",
  },
} as const;
