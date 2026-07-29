import { z } from "zod";

import {
  optionalSearchStringSchema,
  queryBooleanSchema,
} from "../common/common.schemas";
import {
  BILLING_STATUSES,
  COMPANY_WALLET_TYPES,
  CREATABLE_MONEY_TRANSACTION_TYPES,
  FINANCIAL_CATEGORY_KINDS,
  MONEY_TRANSACTION_SCOPES,
  MONEY_TRANSACTION_STATUSES,
  MONEY_TRANSACTION_TYPES,
  PAYMENT_METHODS,
  WALLET_BALANCE_BUCKETS,
  WALLET_TYPES,
} from "./finance.constants";
import type { WalletType } from "./finance.constants";

const MAX_NAME_LENGTH = 120;
const MAX_CODE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_REFERENCE_TYPE_LENGTH = 80;
const MAX_REFERENCE_ID_LENGTH = 200;
const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 2_048;
const MAX_BALANCE_CHANGES = 16;
const MAX_REFERENCES = 20;
const MAX_SUMMARY_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

const unsignedMoneyPattern = /^(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/;
const signedMoneyPattern = /^-?(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/;
const aggregateMoneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const signedAggregateMoneyPattern = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/))
  .default("RON");

export const moneyAmountSchema = z.string().trim().regex(unsignedMoneyPattern, {
  message: "Amount must be a non-negative decimal with at most 2 decimals.",
});

export const positiveMoneyAmountSchema = moneyAmountSchema.refine(
  (value) => !/^0(?:\.0{1,2})?$/.test(value),
  { message: "Amount must be greater than zero." },
);

export const aggregateMoneyAmountSchema = z
  .string()
  .trim()
  .regex(aggregateMoneyPattern, {
    message:
      "Aggregate amount must be a non-negative decimal with at most 2 decimals.",
  });

export const positiveAggregateMoneyAmountSchema =
  aggregateMoneyAmountSchema.refine(
    (value) => !/^0(?:\.0{1,2})?$/.test(value),
    { message: "Aggregate amount must be greater than zero." },
  );

export const signedAggregateMoneyAmountSchema = z
  .string()
  .trim()
  .regex(signedAggregateMoneyPattern, {
    message:
      "Aggregate amount must be a decimal with at most 2 decimal places.",
  });

export const signedMoneyAmountSchema = z
  .string()
  .trim()
  .regex(signedMoneyPattern, {
    message: "Amount must be a decimal with at most 2 decimals.",
  });

export const signedNonZeroMoneyAmountSchema = signedMoneyAmountSchema.refine(
  (value) => !/^-?0(?:\.0{1,2})?$/.test(value),
  {
    message: "Balance change must not be zero.",
  },
);

export const walletTypeSchema = z.enum(WALLET_TYPES);
export const companyWalletTypeSchema = z.enum(COMPANY_WALLET_TYPES);
export const walletBalanceBucketSchema = z.enum(WALLET_BALANCE_BUCKETS);
export const moneyTransactionTypeSchema = z.enum(MONEY_TRANSACTION_TYPES);
export const creatableMoneyTransactionTypeSchema = z.enum(
  CREATABLE_MONEY_TRANSACTION_TYPES,
);
export const moneyTransactionStatusSchema = z.enum(MONEY_TRANSACTION_STATUSES);
export const moneyTransactionScopeSchema = z.enum(MONEY_TRANSACTION_SCOPES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const billingStatusSchema = z.enum(BILLING_STATUSES);
export const financialCategoryKindSchema = z.enum(FINANCIAL_CATEGORY_KINDS);

export const financeUserSummarySchema = z
  .object({
    id: z.string(),
    email: z.email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  })
  .meta({ id: "FinanceUserSummary" });

export type FinanceUserSummary = z.infer<typeof financeUserSummarySchema>;

export const financeWalletSummarySchema = z
  .object({
    id: z.string(),
    type: walletTypeSchema,
    ownerUserId: z.string().nullable(),
    name: z.string(),
    owner: financeUserSummarySchema.nullable(),
  })
  .meta({ id: "FinanceWalletSummary" });

export type FinanceWalletSummary = z.infer<typeof financeWalletSummarySchema>;

export const financeCategorySummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    kind: financialCategoryKindSchema,
  })
  .meta({ id: "FinanceCategorySummary" });

export type FinanceCategorySummary = z.infer<
  typeof financeCategorySummarySchema
>;

export const walletOwnerSchema = financeUserSummarySchema
  .clone()
  .meta({ id: "FinanceWalletOwner" });

export const walletBalanceSchema = z
  .object({
    bucket: walletBalanceBucketSchema,
    currency: currencySchema,
    balance: signedMoneyAmountSchema,
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "WalletBalance" });

export const walletSchema = z
  .object({
    id: z.string(),
    type: walletTypeSchema,
    ownerUserId: z.string().nullable(),
    owner: walletOwnerSchema.nullable(),
    name: z.string(),
    isActive: z.boolean(),
    balances: z.array(walletBalanceSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "Wallet" });

export type Wallet = z.infer<typeof walletSchema>;

export const walletListSchema = z
  .object({
    items: z.array(walletSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "WalletList" });

export type WalletList = z.infer<typeof walletListSchema>;

export const walletOptionSchema = z
  .object({
    id: z.string(),
    type: walletTypeSchema,
    name: z.string(),
    isActive: z.boolean(),
    owner: financeUserSummarySchema.nullable(),
  })
  .strict()
  .meta({ id: "WalletOption" });

export type WalletOption = z.infer<typeof walletOptionSchema>;

export const walletOptionListSchema = z
  .object({
    items: z.array(walletOptionSchema),
    nextCursor: z.string().nullable(),
  })
  .strict()
  .meta({ id: "WalletOptionList" });

export type WalletOptionList = z.infer<typeof walletOptionListSchema>;

export interface WalletOptionCursorFilters {
  search?: string;
  type?: WalletType;
  companyOnly?: boolean;
  ownerRole?: "ADMIN";
  ownerUserId?: string;
  isActive?: boolean;
}

const walletOptionCursorFingerprintSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/);

export const walletOptionCursorPayloadSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    sortFingerprint: walletOptionCursorFingerprintSchema,
    filterFingerprint: walletOptionCursorFingerprintSchema,
  })
  .strict();

export type WalletOptionCursorPayload = z.infer<
  typeof walletOptionCursorPayloadSchema
>;

export const listWalletOptionsQuerySchema = z
  .object({
    search: z.preprocess(
      (value) =>
        typeof value === "string" ? value.replace(/\s+/g, " ") : value,
      optionalSearchStringSchema(MAX_NAME_LENGTH),
    ),
    type: walletTypeSchema.optional(),
    companyOnly: queryBooleanSchema.optional(),
    ownerRole: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z.literal("ADMIN"),
      )
      .optional(),
    ownerUserId: z.string().trim().min(1).optional(),
    isActive: queryBooleanSchema.optional(),
    cursor: z
      .string()
      .min(1)
      .max(MAX_CURSOR_LENGTH)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (!query.companyOnly) return;

    if (query.type === "USER") {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: "A company-only selector cannot use the USER wallet type.",
      });
    }
    if (query.ownerRole !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerRole"],
        message: "A company-only selector cannot filter by owner role.",
      });
    }
    if (query.ownerUserId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerUserId"],
        message: "A company-only selector cannot filter by owner user ID.",
      });
    }
  })
  .meta({ id: "ListWalletOptionsQuery" });

export type ListWalletOptionsQuery = z.infer<
  typeof listWalletOptionsQuerySchema
>;

export const listWalletsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    type: walletTypeSchema.optional(),
    search: z.preprocess(
      (value) =>
        typeof value === "string" ? value.replace(/\s+/g, " ") : value,
      optionalSearchStringSchema(MAX_NAME_LENGTH),
    ),
    ownerUserId: z.string().trim().min(1).optional(),
    ownerRole: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z.literal("ADMIN"),
      )
      .optional(),
    ownerIsActive: queryBooleanSchema.optional(),
    isActive: queryBooleanSchema.optional(),
  })
  .strict()
  .meta({ id: "ListWalletsQuery" });

export type ListWalletsQuery = z.infer<typeof listWalletsQuerySchema>;

export const createCompanyWalletInputSchema = z
  .object({
    type: companyWalletTypeSchema,
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  })
  .strict()
  .meta({ id: "CreateCompanyWalletInput" });

export type CreateCompanyWalletInput = z.infer<
  typeof createCompanyWalletInputSchema
>;

export const financialCategorySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    kind: financialCategoryKindSchema,
    parentCategoryId: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "FinancialCategory" });

export type FinancialCategory = z.infer<typeof financialCategorySchema>;

export const financialCategoryListSchema = z
  .object({
    items: z.array(financialCategorySchema),
  })
  .meta({ id: "FinancialCategoryList" });

export const createFinancialCategoryInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*$/)
          .max(MAX_CODE_LENGTH),
      ),
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    kind: financialCategoryKindSchema,
    parentCategoryId: z.string().nullable().optional(),
  })
  .strict()
  .meta({ id: "CreateFinancialCategoryInput" });

export type CreateFinancialCategoryInput = z.infer<
  typeof createFinancialCategoryInputSchema
>;

export const updateFinancialCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
    kind: financialCategoryKindSchema.optional(),
    parentCategoryId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  })
  .meta({ id: "UpdateFinancialCategoryInput" });

export type UpdateFinancialCategoryInput = z.infer<
  typeof updateFinancialCategoryInputSchema
>;

export const walletBalanceChangeInputSchema = z
  .object({
    walletId: z.string().min(1),
    bucket: walletBalanceBucketSchema,
    currency: currencySchema,
    amountDelta: signedNonZeroMoneyAmountSchema,
  })
  .strict();

export type WalletBalanceChangeInput = z.infer<
  typeof walletBalanceChangeInputSchema
>;

export const moneyTransactionReferenceInputSchema = z
  .object({
    referenceType: z
      .string()
      .trim()
      .min(1)
      .max(MAX_REFERENCE_TYPE_LENGTH)
      .transform((value) => value.toUpperCase()),
    referenceId: z.string().trim().min(1).max(MAX_REFERENCE_ID_LENGTH),
    isPrimary: z.boolean().default(false),
  })
  .strict();

export const createMoneyTransactionInputSchema = z
  .object({
    type: creatableMoneyTransactionTypeSchema,
    amount: positiveMoneyAmountSchema,
    currency: currencySchema,
    financialScope: moneyTransactionScopeSchema,
    paymentMethod: paymentMethodSchema.nullable().optional(),
    billingStatus: billingStatusSchema.default("NOT_APPLICABLE"),
    categoryId: z.string().nullable().optional(),
    counterpartyUserId: z.string().nullable().optional(),
    recipientUserId: z.string().nullable().optional(),
    debtorUserId: z.string().nullable().optional(),
    creditorUserId: z.string().nullable().optional(),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    description: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH),
    postImmediately: z.boolean().default(true),
    balanceChanges: z
      .array(walletBalanceChangeInputSchema)
      .max(MAX_BALANCE_CHANGES)
      .default([]),
    references: z
      .array(moneyTransactionReferenceInputSchema)
      .max(MAX_REFERENCES)
      .default([]),
  })
  .strict()
  .superRefine((input, ctx) => {
    const primaryReferences = input.references.filter(
      (reference) => reference.isPrimary,
    );
    if (primaryReferences.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["references"],
        message: "Only one primary reference is allowed.",
      });
    }

    const changeKeys = input.balanceChanges.map(
      (change) => `${change.walletId}:${change.bucket}:${change.currency}`,
    );
    if (new Set(changeKeys).size !== changeKeys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["balanceChanges"],
        message:
          "A transaction can change a wallet bucket and currency only once.",
      });
    }
  })
  .meta({ id: "CreateMoneyTransactionInput" });

export type CreateMoneyTransactionInput = z.infer<
  typeof createMoneyTransactionInputSchema
>;

export const reverseMoneyTransactionInputSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
  })
  .strict()
  .meta({ id: "ReverseMoneyTransactionInput" });

export type ReverseMoneyTransactionInput = z.infer<
  typeof reverseMoneyTransactionInputSchema
>;

export const walletBalanceChangeSchema = z
  .object({
    id: z.string(),
    walletId: z.string(),
    wallet: financeWalletSummarySchema,
    bucket: walletBalanceBucketSchema,
    currency: currencySchema,
    amountDelta: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "WalletBalanceChange" });

export const moneyTransactionReferenceSchema = z
  .object({
    id: z.string(),
    referenceType: z.string(),
    referenceId: z.string(),
    isPrimary: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "MoneyTransactionReference" });

export const moneyTransactionSchema = z
  .object({
    id: z.string(),
    type: moneyTransactionTypeSchema,
    status: moneyTransactionStatusSchema,
    amount: z.string(),
    currency: currencySchema,
    financialScope: moneyTransactionScopeSchema,
    paymentMethod: paymentMethodSchema.nullable(),
    billingStatus: billingStatusSchema,
    categoryId: z.string().nullable(),
    counterpartyUserId: z.string().nullable(),
    recipientUserId: z.string().nullable(),
    debtorUserId: z.string().nullable(),
    creditorUserId: z.string().nullable(),
    recordedByUserId: z.string().nullable(),
    category: financeCategorySummarySchema.nullable(),
    counterparty: financeUserSummarySchema.nullable(),
    recipient: financeUserSummarySchema.nullable(),
    debtor: financeUserSummarySchema.nullable(),
    creditor: financeUserSummarySchema.nullable(),
    recordedBy: financeUserSummarySchema.nullable(),
    occurredAt: z.iso.datetime({ offset: true }),
    description: z.string().nullable(),
    idempotencyKey: z.string(),
    originTransactionId: z.string().nullable(),
    reversalOfTransactionId: z.string().nullable(),
    reversalTransactionId: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    balanceChanges: z.array(walletBalanceChangeSchema),
    references: z.array(moneyTransactionReferenceSchema),
  })
  .meta({ id: "MoneyTransaction" });

export type MoneyTransaction = z.infer<typeof moneyTransactionSchema>;

export const moneyTransactionListSchema = z
  .object({
    items: z.array(moneyTransactionSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "MoneyTransactionList" });

export type MoneyTransactionList = z.infer<typeof moneyTransactionListSchema>;

export const listMoneyTransactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    status: moneyTransactionStatusSchema.optional(),
    type: moneyTransactionTypeSchema.optional(),
    financialScope: moneyTransactionScopeSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    billingStatus: billingStatusSchema.optional(),
    walletId: z.string().optional(),
    userId: z.string().optional(),
    recordedByUserId: z.string().optional(),
    categoryId: z.string().optional(),
    from: z.iso
      .datetime({ offset: true })
      .describe("Inclusive start instant for the half-open ledger period.")
      .optional(),
    to: z.iso
      .datetime({ offset: true })
      .describe("Exclusive end instant for the half-open ledger period.")
      .optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (
      query.from !== undefined &&
      query.to !== undefined &&
      Date.parse(query.from) >= Date.parse(query.to)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end timestamp must be after the start timestamp.",
      });
    }
  })
  .meta({ id: "ListMoneyTransactionsQuery" });

export type ListMoneyTransactionsQuery = z.infer<
  typeof listMoneyTransactionsQuerySchema
>;

export const financeSummaryQuerySchema = z
  .object({
    from: z.iso
      .datetime({ offset: true })
      .describe("Inclusive start instant for the half-open reporting period."),
    to: z.iso
      .datetime({ offset: true })
      .describe("Exclusive end instant for the half-open reporting period."),
  })
  .strict()
  .superRefine((query, ctx) => {
    const fromInstant = Date.parse(query.from);
    const toInstant = Date.parse(query.to);

    if (fromInstant >= toInstant) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end timestamp must be after the start timestamp.",
      });
      return;
    }

    if (toInstant - fromInstant > MAX_SUMMARY_RANGE_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The reporting period must not exceed 366 days.",
      });
    }
  })
  .meta({ id: "FinanceSummaryQuery" });

export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;

const summaryAmountSchema = z.object({
  currency: currencySchema,
  amount: aggregateMoneyAmountSchema,
});

const paymentMethodSummarySchema = summaryAmountSchema.extend({
  paymentMethod: paymentMethodSchema.nullable(),
});

const categoryAmountSummarySchema = summaryAmountSchema.extend({
  category: financeCategorySummarySchema.nullable(),
});

const billingStatusSummarySchema = summaryAmountSchema.extend({
  billingStatus: billingStatusSchema,
});

const financialScopeSummarySchema = summaryAmountSchema.extend({
  financialScope: moneyTransactionScopeSchema,
});

const financeSummaryPeriodSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "FinanceSummaryPeriod" });

const financeCurrencyTotalSchema = z
  .object({
    currency: currencySchema,
    income: aggregateMoneyAmountSchema,
    expenses: aggregateMoneyAmountSchema,
  })
  .meta({ id: "FinanceCurrencyTotal" });

const financeCompanyMoneySchema = z
  .object({
    walletId: z.string(),
    walletType: companyWalletTypeSchema,
    walletName: z.string(),
    currency: currencySchema,
    amount: signedAggregateMoneyAmountSchema,
  })
  .meta({ id: "FinanceCompanyMoney" });

const financeAdminMoneySchema = z
  .object({
    admin: financeUserSummarySchema,
    currency: currencySchema,
    businessFunds: signedAggregateMoneyAmountSchema,
    personalFunds: signedAggregateMoneyAmountSchema,
    customerGuaranteeFunds: signedAggregateMoneyAmountSchema,
  })
  .meta({ id: "FinanceAdminMoney" });

export const financeBalanceSnapshotSchema = z
  .object({
    wallet: financeWalletSummarySchema,
    bucket: walletBalanceBucketSchema,
    currency: currencySchema,
    balance: signedMoneyAmountSchema,
    ownerIsActive: z.boolean().nullable(),
    ownerIsAdmin: z.boolean().nullable(),
  })
  .meta({ id: "FinanceBalanceSnapshot" });

export type FinanceBalanceSnapshot = z.infer<
  typeof financeBalanceSnapshotSchema
>;

const financeCurrentBalancesSchema = z
  .object({
    company: z.array(financeBalanceSnapshotSchema),
    admins: z.array(financeBalanceSnapshotSchema),
  })
  .meta({ id: "FinanceCurrentBalances" });

export const financeSummarySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    period: financeSummaryPeriodSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    income: z.array(summaryAmountSchema),
    expenses: z.array(summaryAmountSchema),
    totals: z.array(financeCurrencyTotalSchema),
    incomeByPaymentMethod: z.array(paymentMethodSummarySchema),
    expensesByCategory: z.array(categoryAmountSummarySchema),
    incomeByBillingStatus: z.array(billingStatusSummarySchema),
    incomeByScope: z.array(financialScopeSummarySchema),
    companyMoney: z.array(financeCompanyMoneySchema),
    adminMoney: z.array(financeAdminMoneySchema),
    currentBalances: financeCurrentBalancesSchema,
  })
  .meta({ id: "FinanceSummary" });

export type FinanceSummary = z.infer<typeof financeSummarySchema>;

export const outstandingPersonalClaimSchema = z
  .object({
    debtorUserId: z.string(),
    creditorUserId: z.string(),
    debtor: financeUserSummarySchema,
    creditor: financeUserSummarySchema,
    currency: currencySchema,
    amount: positiveAggregateMoneyAmountSchema,
  })
  .meta({ id: "OutstandingPersonalClaim" });

export type OutstandingPersonalClaim = z.infer<
  typeof outstandingPersonalClaimSchema
>;

export const outstandingPersonalClaimListSchema = z
  .object({
    items: z.array(outstandingPersonalClaimSchema),
  })
  .meta({ id: "OutstandingPersonalClaimList" });
