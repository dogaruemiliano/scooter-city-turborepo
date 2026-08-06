import { z } from "zod";

import { queryBooleanSchema } from "../common/common.schemas";

import {
  aggregateMoneyAmountSchema,
  createCompanyInputSchema,
  currencySchema,
  financialCounterpartySearchItemSchema,
  financeCategorySummarySchema,
  financeUserSummarySchema,
  moneyAmountSchema,
  moneyTransactionReferenceInputSchema,
  positiveMoneyAmountSchema,
  walletOptionSchema,
} from "./finance.schemas";
import {
  EXPENSE_ATTRIBUTION_TARGETS,
  EXPENSE_BUYER_CUI_STATUSES,
  EXPENSE_DOCUMENT_ASSET_ROLES,
  EXPENSE_DOCUMENT_CONTENT_TYPES,
  EXPENSE_DOCUMENT_REVIEW_STATUSES,
  EXPENSE_DOCUMENT_TYPES,
  EXPENSE_FUNDING_TREATMENTS,
  EXPENSE_PAYMENT_SOURCES,
  EXPENSE_POSTING_ROLES,
  EXPENSE_REIMBURSEMENT_STATUSES,
  EXPENSE_STATUSES,
  EXPENSE_USER_OPTION_PURPOSES,
  expenseFundingTreatmentFor,
} from "./expense.constants";

const MAX_PAGE_SIZE = 100;
const MAX_NOTES_LENGTH = 2_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_DOCUMENT_TEXT_LENGTH = 255;
const MAX_REFERENCES = 20;
const MAX_DOCUMENTS = 20;
const MAX_TAX_LINES = 20;
const MAX_SCOOTER_ALLOCATIONS = 200;

const optionalText = (max = MAX_DOCUMENT_TEXT_LENGTH) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(max).nullable().optional(),
  );

const idSchema = z.string().trim().min(1);
const dateSchema = z.iso.date();
const percentageSchema = z
  .string()
  .trim()
  .regex(/^(?:100(?:\.0{1,4})?|(?:0|[1-9]\d?)(?:\.\d{1,4})?)$/, {
    message: "Percentage must be between 0 and 100 with at most 4 decimals.",
  });

function moneyMinor(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

function addMoney(values: string[]): bigint {
  return values.reduce((total, value) => total + moneyMinor(value), BigInt(0));
}

function percentageUnits(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10_000) + BigInt(fraction.padEnd(4, "0"));
}

function roundedVatMinor(netAmount: string, vatRate: string): bigint {
  const denominator = BigInt(1_000_000);
  const numerator = moneyMinor(netAmount) * percentageUnits(vatRate);
  return (numerator + denominator / BigInt(2)) / denominator;
}

export const expenseStatusSchema = z.enum(EXPENSE_STATUSES);
export const expensePaymentSourceSchema = z.enum(EXPENSE_PAYMENT_SOURCES);
export const expenseFundingTreatmentSchema = z.enum(EXPENSE_FUNDING_TREATMENTS);
export const expenseAttributionTargetSchema = z.enum(
  EXPENSE_ATTRIBUTION_TARGETS,
);
export const expenseDocumentTypeSchema = z.enum(EXPENSE_DOCUMENT_TYPES);
export const expenseDocumentReviewStatusSchema = z.enum(
  EXPENSE_DOCUMENT_REVIEW_STATUSES,
);
export const expenseBuyerCuiStatusSchema = z.enum(EXPENSE_BUYER_CUI_STATUSES);
export const expenseDocumentAssetRoleSchema = z.enum(
  EXPENSE_DOCUMENT_ASSET_ROLES,
);
export const expenseDocumentContentTypeSchema = z.enum(
  EXPENSE_DOCUMENT_CONTENT_TYPES,
);
export const expensePostingRoleSchema = z.enum(EXPENSE_POSTING_ROLES);
export const expenseReimbursementStatusSchema = z.enum(
  EXPENSE_REIMBURSEMENT_STATUSES,
);

export const expensePaymentInputSchema = z
  .object({
    source: expensePaymentSourceSchema,
    companyWalletId: idSchema.nullable().optional(),
    fundedByUserId: idSchema.nullable().optional(),
    paidByUserId: idSchema,
    amount: positiveMoneyAmountSchema,
    paidOn: dateSchema,
  })
  .strict()
  .superRefine((payment, ctx) => {
    if (payment.source === "PERSONAL_FUNDS") {
      if (!payment.fundedByUserId) {
        ctx.addIssue({
          code: "custom",
          path: ["fundedByUserId"],
          message: "Personal funds require a funding user.",
        });
      }
      if (payment.companyWalletId != null) {
        ctx.addIssue({
          code: "custom",
          path: ["companyWalletId"],
          message: "Personal funds cannot use a company wallet.",
        });
      }
      return;
    }

    if (!payment.companyWalletId) {
      ctx.addIssue({
        code: "custom",
        path: ["companyWalletId"],
        message: "A company payment source requires a company wallet.",
      });
    }
    if (payment.fundedByUserId != null) {
      ctx.addIssue({
        code: "custom",
        path: ["fundedByUserId"],
        message: "A company payment source cannot name a personal funder.",
      });
    }
  });
export type ExpensePaymentInput = z.infer<typeof expensePaymentInputSchema>;

export const expenseAttributionInputSchema = z
  .object({
    target: expenseAttributionTargetSchema,
    businessOwnerId: idSchema.nullable().optional(),
  })
  .strict()
  .superRefine((attribution, ctx) => {
    if (attribution.target === "OWNER" && !attribution.businessOwnerId) {
      ctx.addIssue({
        code: "custom",
        path: ["businessOwnerId"],
        message: "Owner attribution requires a business owner.",
      });
    }
    if (
      attribution.target === "BUSINESS" &&
      attribution.businessOwnerId != null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["businessOwnerId"],
        message: "Business attribution cannot name a specific owner.",
      });
    }
  });
export type ExpenseAttributionInput = z.infer<
  typeof expenseAttributionInputSchema
>;

export const expenseScooterAllocationInputSchema = z
  .object({
    scooterId: idSchema,
    amount: positiveMoneyAmountSchema,
  })
  .strict();
export type ExpenseScooterAllocationInput = z.infer<
  typeof expenseScooterAllocationInputSchema
>;

export const expenseTaxLineInputSchema = z
  .object({
    vatRate: percentageSchema,
    netAmount: moneyAmountSchema,
    vatAmount: moneyAmountSchema,
    grossAmount: positiveMoneyAmountSchema,
    deductiblePercent: percentageSchema.default("100"),
  })
  .strict()
  .superRefine((line, ctx) => {
    if (
      moneyMinor(line.netAmount) + moneyMinor(line.vatAmount) !==
      moneyMinor(line.grossAmount)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["grossAmount"],
        message: "Tax-line net and VAT amounts must equal its gross amount.",
      });
    }
    if (
      roundedVatMinor(line.netAmount, line.vatRate) !==
      moneyMinor(line.vatAmount)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["vatAmount"],
        message:
          "VAT amount must equal net amount times VAT rate, rounded half-up to cents.",
      });
    }
  });
export type ExpenseTaxLineInput = z.infer<typeof expenseTaxLineInputSchema>;

export const expenseDocumentAssetInputSchema = z
  .object({
    assetId: idSchema,
    role: expenseDocumentAssetRoleSchema,
  })
  .strict();

export const expenseDocumentInputSchema = z
  .object({
    type: expenseDocumentTypeSchema,
    documentSeries: optionalText(),
    documentNumber: optionalText(),
    supplierName: optionalText(),
    supplierTaxIdentifier: optionalText(),
    buyerTaxIdentifier: optionalText(),
    issuedOn: dateSchema.nullable().optional(),
    buyerCuiStatus: expenseBuyerCuiStatusSchema.default("NOT_REVIEWED"),
    reviewStatus: expenseDocumentReviewStatusSchema.default("PENDING"),
    notes: optionalText(MAX_NOTES_LENGTH),
  })
  .strict()
  .meta({ id: "ExpenseDocumentInput" });
export type ExpenseDocumentInput = z.infer<typeof expenseDocumentInputSchema>;

const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export const createExpenseDocumentInputSchema = z
  .object({
    type: expenseDocumentTypeSchema,
    documentSeries: optionalText(),
    documentNumber: optionalText(),
    supplierName: optionalText(),
    supplierTaxIdentifier: optionalText(),
    buyerTaxIdentifier: optionalText(),
    issuedOn: dateSchema.nullable().optional(),
    buyerCuiStatus: expenseBuyerCuiStatusSchema.default("NOT_REVIEWED"),
    reviewStatus: expenseDocumentReviewStatusSchema.default("PENDING"),
    notes: optionalText(MAX_NOTES_LENGTH),
  })
  .strict()
  .meta({ id: "CreateExpenseDocumentInput" });
export type CreateExpenseDocumentInput = z.infer<
  typeof createExpenseDocumentInputSchema
>;

export const updateExpenseDocumentInputSchema = z
  .object({
    type: expenseDocumentTypeSchema.optional(),
    documentSeries: optionalText(),
    documentNumber: optionalText(),
    supplierName: optionalText(),
    supplierTaxIdentifier: optionalText(),
    buyerTaxIdentifier: optionalText(),
    issuedOn: dateSchema.nullable().optional(),
    buyerCuiStatus: expenseBuyerCuiStatusSchema.optional(),
    reviewStatus: expenseDocumentReviewStatusSchema.optional(),
    notes: optionalText(MAX_NOTES_LENGTH),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one document field is required.",
  })
  .meta({ id: "UpdateExpenseDocumentInput" });
export type UpdateExpenseDocumentInput = z.infer<
  typeof updateExpenseDocumentInputSchema
>;

export const createExpenseDocumentUploadUrlInputSchema = z
  .object({
    contentType: expenseDocumentContentTypeSchema,
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(SHA_256_HEX_PATTERN),
    imageWidth: z.number().int().positive().nullable().optional(),
    imageHeight: z.number().int().positive().nullable().optional(),
    pageCount: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const isPdf = input.contentType === "application/pdf";
    if (isPdf && !input.pageCount) {
      ctx.addIssue({
        code: "custom",
        path: ["pageCount"],
        message: "PDF uploads require a page count.",
      });
    }
    if (isPdf && (input.imageWidth != null || input.imageHeight != null)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageWidth"],
        message: "PDF uploads cannot use image dimensions.",
      });
    }
    if (!isPdf && (!input.imageWidth || !input.imageHeight)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageWidth"],
        message: "Image uploads require width and height.",
      });
    }
    if (!isPdf && input.pageCount != null) {
      ctx.addIssue({
        code: "custom",
        path: ["pageCount"],
        message: "Image uploads cannot use a page count.",
      });
    }
  })
  .meta({ id: "CreateExpenseDocumentUploadUrlInput" });
export type CreateExpenseDocumentUploadUrlInput = z.infer<
  typeof createExpenseDocumentUploadUrlInputSchema
>;

export const expenseDocumentUploadUrlSchema = z
  .object({
    uploadUrl: z.string().url(),
    uploadToken: z.string().min(1),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime({ offset: true }),
    maxBytes: z.number().int().positive(),
  })
  .strict()
  .meta({ id: "ExpenseDocumentUploadUrl" });
export type ExpenseDocumentUploadUrl = z.infer<
  typeof expenseDocumentUploadUrlSchema
>;

export const completeExpenseDocumentUploadInputSchema = z
  .object({ uploadToken: z.string().min(1) })
  .strict()
  .meta({ id: "CompleteExpenseDocumentUploadInput" });
export type CompleteExpenseDocumentUploadInput = z.infer<
  typeof completeExpenseDocumentUploadInputSchema
>;

export const createExpenseInputSchema = z
  .object({
    legalEntityId: idSchema,
    /** Optional: unset for a quick-entry expense with no known recipient. */
    payeeId: idSchema.optional(),
    /** Optional: unset for a quick-entry expense not yet categorized. */
    categoryId: idSchema.optional(),
    occurredOn: dateSchema,
    taxPointOn: dateSchema.optional(),
    currency: currencySchema,
    grossAmount: positiveMoneyAmountSchema,
    fiscalDeductibleAmount: moneyAmountSchema.optional(),
    notes: optionalText(MAX_NOTES_LENGTH),
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH),
    postImmediately: z.boolean().default(false),
    payment: expensePaymentInputSchema,
    attribution: expenseAttributionInputSchema,
    taxLines: z.array(expenseTaxLineInputSchema).max(MAX_TAX_LINES).default([]),
    references: z
      .array(moneyTransactionReferenceInputSchema)
      .max(MAX_REFERENCES)
      .default([]),
    documents: z
      .array(expenseDocumentInputSchema)
      .max(MAX_DOCUMENTS)
      .default([]),
    scooterAllocations: z
      .array(expenseScooterAllocationInputSchema)
      .max(MAX_SCOOTER_ALLOCATIONS)
      .default([]),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (moneyMinor(input.payment.amount) !== moneyMinor(input.grossAmount)) {
      ctx.addIssue({
        code: "custom",
        path: ["payment", "amount"],
        message: "The single payment must equal the expense gross amount.",
      });
    }
    if (
      input.taxLines.length > 0 &&
      addMoney(input.taxLines.map((line) => line.grossAmount)) !==
        moneyMinor(input.grossAmount)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["taxLines"],
        message: "Tax-line gross amounts must equal the expense gross amount.",
      });
    }
    if (
      input.fiscalDeductibleAmount !== undefined &&
      moneyMinor(input.fiscalDeductibleAmount) > moneyMinor(input.grossAmount)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["fiscalDeductibleAmount"],
        message: "Fiscal deductible amount cannot exceed gross amount.",
      });
    }
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
    if (input.scooterAllocations.length > 0) {
      if (
        addMoney(
          input.scooterAllocations.map((allocation) => allocation.amount),
        ) !== moneyMinor(input.grossAmount)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["scooterAllocations"],
          message:
            "Scooter allocation amounts must equal the expense gross amount.",
        });
      }
      const scooterIds = input.scooterAllocations.map(
        (allocation) => allocation.scooterId,
      );
      if (new Set(scooterIds).size !== scooterIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["scooterAllocations"],
          message: "Each scooter can only be allocated once per expense.",
        });
      }
    }
  })
  .meta({ id: "CreateExpenseInput" });
export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;

export const updateExpenseInputSchema = z
  .object({
    payeeId: idSchema.optional(),
    categoryId: idSchema.optional(),
    occurredOn: dateSchema.optional(),
    taxPointOn: dateSchema.optional(),
    fiscalDeductibleAmount: moneyAmountSchema.optional(),
    notes: optionalText(MAX_NOTES_LENGTH),
    payment: expensePaymentInputSchema.optional(),
    attribution: expenseAttributionInputSchema.optional(),
    taxLines: z.array(expenseTaxLineInputSchema).max(MAX_TAX_LINES).optional(),
    references: z
      .array(moneyTransactionReferenceInputSchema)
      .max(MAX_REFERENCES)
      .optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required.",
  })
  .meta({ id: "UpdateExpenseInput" });
export type UpdateExpenseInput = z.infer<typeof updateExpenseInputSchema>;

export const expenseActionInputSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH),
    reason: optionalText(MAX_NOTES_LENGTH),
  })
  .strict()
  .meta({ id: "ExpenseActionInput" });
export type ExpenseActionInput = z.infer<typeof expenseActionInputSchema>;

export const listExpensesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    legalEntityId: idSchema.optional(),
    status: expenseStatusSchema.optional(),
    categoryId: idSchema.optional(),
    payeeId: idSchema.optional(),
    attributionTarget: expenseAttributionTargetSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (query.from && query.to && query.from >= query.to) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "The exclusive end date must be after the start date.",
      });
    }
  })
  .meta({ id: "ListExpensesQuery" });
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export const createBusinessLegalEntityInputSchema = z
  .object({
    companyId: idSchema.optional(),
    company: createCompanyInputSchema.optional(),
    defaultCurrency: currencySchema,
    walletIds: z.array(idSchema).max(100).default([]),
    bankAccounts: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            cardHolderUserId: idSchema,
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
  .refine((input) => Boolean(input.companyId) !== Boolean(input.company), {
    message: "Provide exactly one existing companyId or new company.",
    path: ["companyId"],
  })
  .superRefine((input, ctx) => {
    if (input.company && !input.company.taxIdentifier) {
      ctx.addIssue({
        code: "custom",
        path: ["company", "taxIdentifier"],
        message: "A business legal entity company requires a tax identifier.",
      });
    }
    const normalizedNames = input.bankAccounts.map((account) =>
      account.name.toLocaleLowerCase(),
    );
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      ctx.addIssue({
        code: "custom",
        path: ["bankAccounts"],
        message: "Bank account names must be unique for the company.",
      });
    }
  })
  .meta({ id: "CreateBusinessLegalEntityInput" });
export type CreateBusinessLegalEntityInput = z.infer<
  typeof createBusinessLegalEntityInputSchema
>;

export const updateBusinessLegalEntityInputSchema = z
  .object({
    defaultCurrency: currencySchema.optional(),
    isActive: z.boolean().optional(),
    walletIds: z.array(idSchema).max(100).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required.",
  })
  .meta({ id: "UpdateBusinessLegalEntityInput" });
export type UpdateBusinessLegalEntityInput = z.infer<
  typeof updateBusinessLegalEntityInputSchema
>;

export const createBusinessOwnerInputSchema = z
  .object({
    userId: idSchema,
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) => !input.effectiveTo || input.effectiveTo > input.effectiveFrom,
    {
      path: ["effectiveTo"],
      message: "Owner effectiveTo must be after effectiveFrom.",
    },
  )
  .meta({ id: "CreateBusinessOwnerInput" });
export type CreateBusinessOwnerInput = z.infer<
  typeof createBusinessOwnerInputSchema
>;

export const updateBusinessOwnerInputSchema = z
  .object({
    effectiveFrom: dateSchema.optional(),
    effectiveTo: dateSchema.nullable().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required.",
  })
  .meta({ id: "UpdateBusinessOwnerInput" });
export type UpdateBusinessOwnerInput = z.infer<
  typeof updateBusinessOwnerInputSchema
>;

const vatRegistrationPeriodFieldsSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  vatNumber: z.string().trim().min(1).max(MAX_DOCUMENT_TEXT_LENGTH),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable().optional(),
});

export const createVatRegistrationPeriodInputSchema =
  vatRegistrationPeriodFieldsSchema
    .strict()
    .refine(
      (input) => !input.effectiveTo || input.effectiveTo > input.effectiveFrom,
      {
        path: ["effectiveTo"],
        message: "VAT effectiveTo must be after effectiveFrom.",
      },
    )
    .meta({ id: "CreateVatRegistrationPeriodInput" });
export type CreateVatRegistrationPeriodInput = z.infer<
  typeof createVatRegistrationPeriodInputSchema
>;

export const updateVatRegistrationPeriodInputSchema =
  vatRegistrationPeriodFieldsSchema
    .partial()
    .strict()
    .refine((input) => Object.keys(input).length > 0, {
      message: "At least one field is required.",
    })
    .meta({ id: "UpdateVatRegistrationPeriodInput" });
export type UpdateVatRegistrationPeriodInput = z.infer<
  typeof updateVatRegistrationPeriodInputSchema
>;

export const listExpenseOptionsQuerySchema = z
  .object({
    legalEntityId: idSchema.optional(),
    on: dateSchema.optional(),
    includeInactive: queryBooleanSchema.default(false),
  })
  .strict()
  .meta({ id: "ListExpenseOptionsQuery" });
export type ListExpenseOptionsQuery = z.infer<
  typeof listExpenseOptionsQuerySchema
>;

export const listExpenseUserOptionsQuerySchema = z
  .object({
    purpose: z.enum(EXPENSE_USER_OPTION_PURPOSES).default("PAYMENT_ACTOR"),
    search: z.preprocess(
      (value) =>
        typeof value === "string"
          ? value.replace(/\s+/gu, " ").trim() || undefined
          : value,
      z.string().max(120).optional(),
    ),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    cursor: idSchema.optional(),
  })
  .strict()
  .meta({ id: "ListExpenseUserOptionsQuery" });
export type ListExpenseUserOptionsQuery = z.infer<
  typeof listExpenseUserOptionsQuerySchema
>;

export const expenseUserOptionSchema = financeUserSummarySchema
  .clone()
  .meta({ id: "ExpenseUserOption" });
export type ExpenseUserOption = z.infer<typeof expenseUserOptionSchema>;

export const expenseUserOptionListSchema = z
  .object({
    items: z.array(expenseUserOptionSchema),
    nextCursor: idSchema.nullable(),
  })
  .strict()
  .meta({ id: "ExpenseUserOptionList" });
export type ExpenseUserOptionList = z.infer<typeof expenseUserOptionListSchema>;

const businessCompanySummarySchema = z
  .object({
    id: idSchema,
    legalName: z.string(),
    tradingName: z.string().nullable(),
    taxIdentifier: z.string().nullable(),
  })
  .strict();

export const businessLegalEntitySchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    company: businessCompanySummarySchema,
    defaultCurrency: currencySchema,
    isActive: z.boolean(),
    wallets: z.array(walletOptionSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .meta({ id: "BusinessLegalEntity" });
export type BusinessLegalEntity = z.infer<typeof businessLegalEntitySchema>;

export const businessLegalEntityListSchema = z
  .object({ items: z.array(businessLegalEntitySchema) })
  .strict()
  .meta({ id: "BusinessLegalEntityList" });
export type BusinessLegalEntityList = z.infer<
  typeof businessLegalEntityListSchema
>;

export const businessOwnerSchema = z
  .object({
    id: idSchema,
    legalEntityId: idSchema,
    userId: idSchema,
    user: financeUserSummarySchema,
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .meta({ id: "BusinessOwner" });
export type BusinessOwner = z.infer<typeof businessOwnerSchema>;

export const businessOwnerListSchema = z
  .object({ items: z.array(businessOwnerSchema) })
  .strict()
  .meta({ id: "BusinessOwnerList" });
export type BusinessOwnerList = z.infer<typeof businessOwnerListSchema>;

export const vatRegistrationPeriodSchema = z
  .object({
    id: idSchema,
    legalEntityId: idSchema,
    countryCode: z.string(),
    vatNumber: z.string(),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .meta({ id: "VatRegistrationPeriod" });
export type VatRegistrationPeriod = z.infer<typeof vatRegistrationPeriodSchema>;

export const vatRegistrationPeriodListSchema = z
  .object({ items: z.array(vatRegistrationPeriodSchema) })
  .strict()
  .meta({ id: "VatRegistrationPeriodList" });
export type VatRegistrationPeriodList = z.infer<
  typeof vatRegistrationPeriodListSchema
>;

export const expensePaymentSchema = z
  .object({
    id: idSchema,
    source: expensePaymentSourceSchema,
    companyWalletId: idSchema.nullable(),
    fundedByUserId: idSchema.nullable(),
    paidByUserId: idSchema,
    amount: moneyAmountSchema,
    paidOn: dateSchema,
    fundingTreatment: expenseFundingTreatmentSchema,
  })
  .strict();

export const expenseAttributionSchema = z
  .object({
    id: idSchema,
    target: expenseAttributionTargetSchema,
    businessOwnerId: idSchema.nullable(),
    percentage: percentageSchema,
    allocatedGrossAmount: moneyAmountSchema,
    allocatedRecognizedCostAmount: moneyAmountSchema,
  })
  .strict();

export const expenseCostPoolSchema = z
  .object({
    id: idSchema,
    grossAmount: moneyAmountSchema,
    recognizedCostAmount: moneyAmountSchema,
    attribution: expenseAttributionSchema,
  })
  .strict();

export const expenseTaxLineSchema = z
  .object({
    id: idSchema,
    vatRate: percentageSchema,
    netAmount: moneyAmountSchema,
    vatAmount: moneyAmountSchema,
    grossAmount: positiveMoneyAmountSchema,
    deductiblePercent: percentageSchema,
    recoverableVatAmount: moneyAmountSchema,
    nonRecoverableVatAmount: moneyAmountSchema,
  })
  .strict();

export const expenseTaxSnapshotSchema = z
  .object({
    id: idSchema,
    vatRegistrationPeriodId: idSchema.nullable(),
    vatRegistrationCountryCode: z.string().nullable(),
    vatRegistrationNumber: z.string().nullable(),
    legalEntityTaxIdentifier: z.string().min(1),
    isVatRegistered: z.boolean(),
    taxPointOn: dateSchema,
    grossAmount: moneyAmountSchema,
    netAmount: moneyAmountSchema,
    vatAmount: moneyAmountSchema,
    recoverableVatAmount: moneyAmountSchema,
    nonRecoverableVatAmount: moneyAmountSchema,
    recognizedCostAmount: moneyAmountSchema,
    lines: z.array(expenseTaxLineSchema),
  })
  .strict();

export const expenseReferenceSchema = moneyTransactionReferenceInputSchema
  .extend({ id: idSchema })
  .strict();

export const expenseScooterAllocationSchema = z
  .object({
    id: idSchema,
    scooterId: idSchema,
    allocatedGrossAmount: moneyAmountSchema,
  })
  .strict();
export type ExpenseScooterAllocation = z.infer<
  typeof expenseScooterAllocationSchema
>;

export const expenseDocumentAssetSchema = z
  .object({
    id: idSchema,
    assetId: idSchema,
    role: expenseDocumentAssetRoleSchema,
    contentType: expenseDocumentContentTypeSchema,
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(SHA_256_HEX_PATTERN),
    imageWidth: z.number().int().positive().nullable(),
    imageHeight: z.number().int().positive().nullable(),
    pageCount: z.number().int().positive().nullable(),
    contentUrl: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const expenseDocumentSchema = z
  .object({
    id: idSchema,
    type: expenseDocumentTypeSchema,
    documentSeries: z.string().nullable(),
    documentNumber: z.string().nullable(),
    supplierName: z.string().nullable(),
    supplierTaxIdentifier: z.string().nullable(),
    buyerTaxIdentifier: z.string().nullable(),
    issuedOn: dateSchema.nullable(),
    buyerCuiStatus: expenseBuyerCuiStatusSchema,
    reviewStatus: expenseDocumentReviewStatusSchema,
    notes: z.string().nullable(),
    assets: z.array(expenseDocumentAssetSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .meta({ id: "ExpenseDocument" });
export type ExpenseDocument = z.infer<typeof expenseDocumentSchema>;

export const expenseDocumentListSchema = z
  .object({ items: z.array(expenseDocumentSchema) })
  .strict()
  .meta({ id: "ExpenseDocumentList" });
export type ExpenseDocumentList = z.infer<typeof expenseDocumentListSchema>;

export const expensePostingSchema = z
  .object({
    id: idSchema,
    role: expensePostingRoleSchema,
    moneyTransactionId: idSchema,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const expenseReimbursementClaimSchema = z
  .object({
    id: idSchema,
    expenseId: idSchema,
    expensePaymentId: idSchema,
    claimantUserId: idSchema,
    status: expenseReimbursementStatusSchema,
    originalAmount: moneyAmountSchema,
    settledAmount: moneyAmountSchema,
    outstandingAmount: moneyAmountSchema,
    currency: currencySchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .meta({ id: "ExpenseReimbursementClaim" });
export type ExpenseReimbursementClaim = z.infer<
  typeof expenseReimbursementClaimSchema
>;

export const settleExpenseReimbursementInputSchema = z
  .object({
    amount: positiveMoneyAmountSchema,
    companyWalletId: idSchema,
    paidOn: dateSchema,
    paidByUserId: idSchema,
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH),
    notes: optionalText(MAX_NOTES_LENGTH),
  })
  .strict()
  .meta({ id: "SettleExpenseReimbursementInput" });
export type SettleExpenseReimbursementInput = z.infer<
  typeof settleExpenseReimbursementInputSchema
>;

export const expenseSchema = z
  .object({
    id: idSchema,
    legalEntityId: idSchema,
    payeeId: idSchema.nullable(),
    payee: financialCounterpartySearchItemSchema.nullable(),
    categoryId: idSchema.nullable(),
    category: financeCategorySummarySchema.nullable(),
    status: expenseStatusSchema,
    occurredOn: dateSchema,
    taxPointOn: dateSchema,
    currency: currencySchema,
    grossAmount: moneyAmountSchema,
    recognizedCostAmount: moneyAmountSchema,
    fiscalDeductibleAmount: moneyAmountSchema,
    notes: z.string().nullable(),
    idempotencyKey: z.string(),
    createdByUserId: idSchema,
    updatedByUserId: idSchema,
    postedByUserId: idSchema.nullable(),
    postedAt: z.iso.datetime({ offset: true }).nullable(),
    reversedByUserId: idSchema.nullable(),
    reversedAt: z.iso.datetime({ offset: true }).nullable(),
    reversalReason: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    payment: expensePaymentSchema,
    costPool: expenseCostPoolSchema,
    taxSnapshot: expenseTaxSnapshotSchema,
    references: z.array(expenseReferenceSchema),
    documents: z.array(expenseDocumentSchema),
    postings: z.array(expensePostingSchema),
    reimbursementClaim: expenseReimbursementClaimSchema.nullable(),
    scooterAllocations: z.array(expenseScooterAllocationSchema),
  })
  .strict()
  .meta({ id: "Expense" });
export type Expense = z.infer<typeof expenseSchema>;

export const expenseListSchema = z
  .object({
    items: z.array(expenseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .strict()
  .meta({ id: "ExpenseList" });
export type ExpenseList = z.infer<typeof expenseListSchema>;

export const listExpenseReimbursementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    legalEntityId: idSchema.optional(),
    status: expenseReimbursementStatusSchema.optional(),
    claimantUserId: idSchema.optional(),
  })
  .strict()
  .meta({ id: "ListExpenseReimbursementsQuery" });
export type ListExpenseReimbursementsQuery = z.infer<
  typeof listExpenseReimbursementsQuerySchema
>;

export const expenseReimbursementListSchema = z
  .object({
    items: z.array(expenseReimbursementClaimSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .strict()
  .meta({ id: "ExpenseReimbursementList" });
export type ExpenseReimbursementList = z.infer<
  typeof expenseReimbursementListSchema
>;

export const expenseReportQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    legalEntityId: idSchema.optional(),
    currency: currencySchema.optional(),
  })
  .strict()
  .refine((query) => query.from < query.to, {
    path: ["to"],
    message: "The exclusive end date must be after the start date.",
  })
  .meta({ id: "ExpenseReportQuery" });
export type ExpenseReportQuery = z.infer<typeof expenseReportQuerySchema>;

const ownerAttributionReportRowSchema = z
  .object({
    businessOwnerId: idSchema,
    userId: idSchema,
    owner: financeUserSummarySchema,
    allocatedGrossAmount: aggregateMoneyAmountSchema,
    allocatedRecognizedCostAmount: aggregateMoneyAmountSchema,
    expenseCount: z.number().int().nonnegative(),
  })
  .strict();

export const expenseAttributionReportSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    items: z.array(
      z
        .object({
          currency: currencySchema,
          totalGrossAmount: aggregateMoneyAmountSchema,
          totalRecognizedCostAmount: aggregateMoneyAmountSchema,
          businessGrossAmount: aggregateMoneyAmountSchema,
          businessRecognizedCostAmount: aggregateMoneyAmountSchema,
          ownerGrossAmount: aggregateMoneyAmountSchema,
          ownerRecognizedCostAmount: aggregateMoneyAmountSchema,
          unallocatedGrossAmount: aggregateMoneyAmountSchema,
          unallocatedRecognizedCostAmount: aggregateMoneyAmountSchema,
          expenseCount: z.number().int().nonnegative(),
          owners: z.array(ownerAttributionReportRowSchema),
        })
        .strict(),
    ),
  })
  .strict()
  .meta({ id: "ExpenseAttributionReport" });
export type ExpenseAttributionReport = z.infer<
  typeof expenseAttributionReportSchema
>;

export const expenseReimbursementReportSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    items: z.array(
      z
        .object({
          currency: currencySchema,
          originalAmount: aggregateMoneyAmountSchema,
          settledAmount: aggregateMoneyAmountSchema,
          outstandingAmount: aggregateMoneyAmountSchema,
          openCount: z.number().int().nonnegative(),
          partiallySettledCount: z.number().int().nonnegative(),
          settledCount: z.number().int().nonnegative(),
          cancelledCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict()
  .meta({ id: "ExpenseReimbursementReport" });
export type ExpenseReimbursementReport = z.infer<
  typeof expenseReimbursementReportSchema
>;

export const expensePaymentSourceReportSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    items: z.array(
      z
        .object({
          currency: currencySchema,
          sources: z.array(
            z
              .object({
                source: expensePaymentSourceSchema,
                grossAmount: aggregateMoneyAmountSchema,
                expenseCount: z.number().int().nonnegative(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict()
  .meta({ id: "ExpensePaymentSourceReport" });
export type ExpensePaymentSourceReport = z.infer<
  typeof expensePaymentSourceReportSchema
>;

export const expenseDocumentReviewReportSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    items: z.array(
      z
        .object({
          currency: currencySchema,
          expenseCount: z.number().int().nonnegative(),
          expenseGrossAmount: aggregateMoneyAmountSchema,
          missingDocumentExpenseCount: z.number().int().nonnegative(),
          pendingDocumentCount: z.number().int().nonnegative(),
          confirmedDocumentCount: z.number().int().nonnegative(),
          rejectedDocumentCount: z.number().int().nonnegative(),
          buyerCuiMismatchCount: z.number().int().nonnegative(),
          buyerCuiMissingCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict()
  .meta({ id: "ExpenseDocumentReviewReport" });
export type ExpenseDocumentReviewReport = z.infer<
  typeof expenseDocumentReviewReportSchema
>;

export function expectedExpenseFundingTreatment(
  input: Pick<CreateExpenseInput, "payment" | "attribution">,
) {
  return expenseFundingTreatmentFor(
    input.payment.source,
    input.attribution.target,
  );
}
