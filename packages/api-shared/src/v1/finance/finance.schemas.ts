/**
 * Financial-module request and response contracts.
 *
 * Design reference: docs/finance/financial-system-architecture.md
 *
 * Two rules shape everything here:
 *
 * 1. Money is an integer count of minor units (`amountMinor`). 300 lei is
 *    `30000`. Floating point never touches a monetary value.
 * 2. Who paid and who benefited are independent inputs. `payments` answers
 *    the first, `allocations` the second; neither is inferred from the other.
 */
import { z } from "zod";

import {
  nullableTrimmedStringSchema,
  queryBooleanSchema,
  requiredTrimmedStringSchema,
} from "../common/common.schemas";
import {
  COST_OBJECT_OWNERSHIP_TYPES,
  COST_OBJECT_TYPES,
  ASSOCIATE_FUNDING_TYPES,
  ECONOMIC_ALLOCATION_TYPES,
  EXPENSE_PAYMENT_SOURCE_TYPES,
  EXPENSE_TREATMENTS,
  FINANCE_BOOK_TYPES,
  FINANCIAL_DOCUMENT_TYPES,
  FINANCIAL_OPERATION_KINDS,
  FINANCIAL_OPERATION_STATUSES,
  LEDGER_ACCOUNT_CATEGORIES,
  LEDGER_ACCOUNT_ROLES,
  PAYMENT_METHODS,
  SETTLEMENT_RUN_KINDS,
} from "./finance.constants";

const MAX_DB_INT = 2_147_483_647;
const MAX_PAGE_SIZE = 100;
const MAX_CODE_LENGTH = 64;
const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_NOTES_LENGTH = 2_000;
const MAX_SUPPLIER_LENGTH = 200;
const MAX_STORAGE_KEY_LENGTH = 512;
const MAX_PAYMENT_LINES = 10;
const MAX_ALLOCATION_LINES = 20;
const MAX_DOCUMENT_LINES = 10;

const idSchema = z.string().trim().min(1);
const isoTimestampSchema = z.iso.datetime({ offset: true });
const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(25);

/**
 * A positive integer count of minor currency units. Direction is carried by
 * the operation kind and the posting sign — never by a negative amount.
 */
export const amountMinorSchema = z.number().int().min(1).max(MAX_DB_INT);

/** Signed posting amount: positive debits, negative credits. */
export const signedAmountMinorSchema = z
  .number()
  .int()
  .min(-MAX_DB_INT)
  .max(MAX_DB_INT);

/** Any balance, which may legitimately be zero or negative. */
export const balanceMinorSchema = z.number().int();

export const shareBasisPointsSchema = z.number().int().min(1).max(10_000);

export const financeBookTypeSchema = z.enum(FINANCE_BOOK_TYPES);
export const financialOperationKindSchema = z.enum(FINANCIAL_OPERATION_KINDS);
export const financialOperationStatusSchema = z.enum(
  FINANCIAL_OPERATION_STATUSES,
);
export const ledgerAccountCategorySchema = z.enum(LEDGER_ACCOUNT_CATEGORIES);
export const ledgerAccountRoleSchema = z.enum(LEDGER_ACCOUNT_ROLES);
export const expenseTreatmentSchema = z.enum(EXPENSE_TREATMENTS);
export const expensePaymentSourceTypeSchema = z.enum(
  EXPENSE_PAYMENT_SOURCE_TYPES,
);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const economicAllocationTypeSchema = z.enum(ECONOMIC_ALLOCATION_TYPES);
export const costObjectTypeSchema = z.enum(COST_OBJECT_TYPES);
export const costObjectOwnershipTypeSchema = z.enum(
  COST_OBJECT_OWNERSHIP_TYPES,
);
export const financialDocumentTypeSchema = z.enum(FINANCIAL_DOCUMENT_TYPES);
export const associateFundingTypeSchema = z.enum(ASSOCIATE_FUNDING_TYPES);
export const settlementRunKindSchema = z.enum(SETTLEMENT_RUN_KINDS);

// ---------------------------------------------------------------------------
// Reference resources
// ---------------------------------------------------------------------------

/** Minimal associate identity, so the UI can label amounts with names. */
export const financeAssociateSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    displayName: z.string(),
  })
  .meta({ id: "FinanceAssociate" });

export type FinanceAssociate = z.infer<typeof financeAssociateSchema>;

export const financeBookMemberSchema = z
  .object({
    id: z.string(),
    associateId: z.string(),
    associate: financeAssociateSchema.nullable(),
    shareBasisPoints: z.number().int(),
    validFrom: isoTimestampSchema,
    validUntil: isoTimestampSchema.nullable(),
  })
  .meta({ id: "FinanceBookMember" });

export type FinanceBookMember = z.infer<typeof financeBookMemberSchema>;

export const financeBookSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: financeBookTypeSchema,
    functionalCurrency: z.string(),
    members: z.array(financeBookMemberSchema),
  })
  .meta({ id: "FinanceBook" });

export type FinanceBook = z.infer<typeof financeBookSchema>;

export const financeBookListSchema = z
  .object({ items: z.array(financeBookSchema) })
  .meta({ id: "FinanceBookList" });

export type FinanceBookList = z.infer<typeof financeBookListSchema>;

export const ledgerAccountSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    code: z.string(),
    name: z.string(),
    category: ledgerAccountCategorySchema,
    role: ledgerAccountRoleSchema,
    associateId: z.string().nullable(),
    associate: financeAssociateSchema.nullable(),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    isSystem: z.boolean(),
  })
  .meta({ id: "LedgerAccount" });

export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;

export const ledgerAccountListSchema = z
  .object({ items: z.array(ledgerAccountSchema) })
  .meta({ id: "LedgerAccountList" });

export type LedgerAccountList = z.infer<typeof ledgerAccountListSchema>;

export const listLedgerAccountsQuerySchema = z
  .object({
    bookId: idSchema.optional(),
    bookType: financeBookTypeSchema.optional(),
    role: ledgerAccountRoleSchema.optional(),
    category: ledgerAccountCategorySchema.optional(),
    associateId: idSchema.optional(),
    includeInactive: queryBooleanSchema.default(false),
  })
  .strict()
  .meta({ id: "ListLedgerAccountsQuery" });

export type ListLedgerAccountsQuery = z.infer<
  typeof listLedgerAccountsQuerySchema
>;

/**
 * A balance computed from journal postings — balances are never stored.
 *
 * `signedBalanceMinor` is the raw debit-positive sum. `displayBalanceMinor`
 * negates it for LIABILITY / REVENUE / EQUITY accounts so the UI can render
 * every balance as a plain positive-is-more number.
 */
export const ledgerAccountBalanceSchema = z
  .object({
    accountId: z.string(),
    bookId: z.string(),
    code: z.string(),
    name: z.string(),
    category: ledgerAccountCategorySchema,
    role: ledgerAccountRoleSchema,
    associateId: z.string().nullable(),
    signedBalanceMinor: balanceMinorSchema,
    displayBalanceMinor: balanceMinorSchema,
    postingCount: z.number().int(),
    asOf: isoTimestampSchema,
  })
  .meta({ id: "LedgerAccountBalance" });

export type LedgerAccountBalance = z.infer<typeof ledgerAccountBalanceSchema>;

export const ledgerAccountBalanceListSchema = z
  .object({ items: z.array(ledgerAccountBalanceSchema) })
  .meta({ id: "LedgerAccountBalanceList" });

export type LedgerAccountBalanceList = z.infer<
  typeof ledgerAccountBalanceListSchema
>;

export const expenseCategorySchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    code: z.string(),
    name: z.string(),
    defaultTreatment: expenseTreatmentSchema.nullable(),
    isActive: z.boolean(),
  })
  .meta({ id: "ExpenseCategory" });

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const expenseCategoryListSchema = z
  .object({ items: z.array(expenseCategorySchema) })
  .meta({ id: "ExpenseCategoryList" });

export type ExpenseCategoryList = z.infer<typeof expenseCategoryListSchema>;

export const listExpenseCategoriesQuerySchema = z
  .object({
    bookId: idSchema.optional(),
    bookType: financeBookTypeSchema.optional(),
    includeInactive: queryBooleanSchema.default(false),
  })
  .strict()
  .meta({ id: "ListExpenseCategoriesQuery" });

export type ListExpenseCategoriesQuery = z.infer<
  typeof listExpenseCategoriesQuerySchema
>;

export const createExpenseCategoryInputSchema = z
  .object({
    bookId: idSchema,
    code: requiredTrimmedStringSchema(MAX_CODE_LENGTH),
    name: requiredTrimmedStringSchema(MAX_NAME_LENGTH),
    defaultTreatment: expenseTreatmentSchema.optional(),
  })
  .strict()
  .meta({ id: "CreateExpenseCategoryInput" });

export type CreateExpenseCategoryInput = z.infer<
  typeof createExpenseCategoryInputSchema
>;

export const costObjectSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    code: z.string(),
    name: z.string(),
    type: costObjectTypeSchema,
    ownershipType: costObjectOwnershipTypeSchema,
    ownerAssociateId: z.string().nullable(),
    externalEntityType: z.string().nullable(),
    externalEntityId: z.string().nullable(),
    /**
     * Prefills the expense form only. The saved expense always carries its
     * own explicit allocations.
     */
    defaultAllocationType: economicAllocationTypeSchema.nullable(),
    defaultBeneficiaryAssociateId: z.string().nullable(),
    isActive: z.boolean(),
  })
  .meta({ id: "CostObject" });

export type CostObject = z.infer<typeof costObjectSchema>;

export const costObjectListSchema = z
  .object({ items: z.array(costObjectSchema) })
  .meta({ id: "CostObjectList" });

export type CostObjectList = z.infer<typeof costObjectListSchema>;

export const listCostObjectsQuerySchema = z
  .object({
    bookId: idSchema.optional(),
    bookType: financeBookTypeSchema.optional(),
    type: costObjectTypeSchema.optional(),
    includeInactive: queryBooleanSchema.default(false),
  })
  .strict()
  .meta({ id: "ListCostObjectsQuery" });

export type ListCostObjectsQuery = z.infer<typeof listCostObjectsQuerySchema>;

const costObjectWritableFields = {
  code: requiredTrimmedStringSchema(MAX_CODE_LENGTH),
  name: requiredTrimmedStringSchema(MAX_NAME_LENGTH),
  type: costObjectTypeSchema,
  ownershipType: costObjectOwnershipTypeSchema,
  ownerAssociateId: idSchema.nullable().optional(),
  externalEntityType: nullableTrimmedStringSchema(MAX_CODE_LENGTH).optional(),
  externalEntityId: idSchema.nullable().optional(),
  defaultAllocationType: economicAllocationTypeSchema.nullable().optional(),
  defaultBeneficiaryAssociateId: idSchema.nullable().optional(),
};

export const createCostObjectInputSchema = z
  .object({ bookId: idSchema, ...costObjectWritableFields })
  .strict()
  .meta({ id: "CreateCostObjectInput" });

export type CreateCostObjectInput = z.infer<typeof createCostObjectInputSchema>;

export const updateCostObjectInputSchema = z
  .object({
    code: costObjectWritableFields.code.optional(),
    name: costObjectWritableFields.name.optional(),
    type: costObjectTypeSchema.optional(),
    ownershipType: costObjectOwnershipTypeSchema.optional(),
    ownerAssociateId: idSchema.nullable().optional(),
    externalEntityType: nullableTrimmedStringSchema(MAX_CODE_LENGTH).optional(),
    externalEntityId: idSchema.nullable().optional(),
    defaultAllocationType: economicAllocationTypeSchema.nullable().optional(),
    defaultBeneficiaryAssociateId: idSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .meta({ id: "UpdateCostObjectInput" });

export type UpdateCostObjectInput = z.infer<typeof updateCostObjectInputSchema>;

// ---------------------------------------------------------------------------
// Posting plan — the shared shape of "what this operation does to the books"
// ---------------------------------------------------------------------------

export const postingLineSchema = z
  .object({
    accountId: z.string(),
    accountCode: z.string(),
    accountName: z.string(),
    accountRole: ledgerAccountRoleSchema,
    accountCategory: ledgerAccountCategorySchema,
    /** Set when the account belongs to one associate. */
    associateId: z.string().nullable(),
    /** Positive debits, negative credits. Lines always sum to zero. */
    signedAmountMinor: signedAmountMinorSchema,
    description: z.string(),
  })
  .meta({ id: "PostingLine" });

export type PostingLine = z.infer<typeof postingLineSchema>;

export const associateAmountSchema = z
  .object({
    associateId: z.string(),
    amountMinor: z.number().int(),
  })
  .meta({ id: "AssociateAmount" });

export type AssociateAmount = z.infer<typeof associateAmountSchema>;

/**
 * Plain-language consequences of an operation, derived from the same posting
 * lines that get persisted. The UI renders this instead of debits and credits.
 */
export const postingImpactSummarySchema = z
  .object({
    /** How much the book's profit is reduced. */
    companyExpenseMinor: z.number().int(),
    /** How much was capitalized rather than expensed. */
    companyAssetIncreaseMinor: z.number().int(),
    /** Net movement of the book's own cash and bank accounts. */
    companyCashImpactMinor: z.number().int(),
    /** Permanent contributed capital added to the company. */
    companyEquityIncreaseMinor: z.number().int(),
    /** New debt the book owes each associate. */
    associatePayables: z.array(associateAmountSchema),
    /** New debt each associate owes the book. */
    associateReceivables: z.array(associateAmountSchema),
    /** Benefit attributed to a named associate; drives settlement. */
    specificEconomicBenefits: z.array(associateAmountSchema),
    /** Benefit shared by everyone; never drives settlement. */
    commonEconomicBenefitMinor: z.number().int(),
  })
  .meta({ id: "PostingImpactSummary" });

export type PostingImpactSummary = z.infer<typeof postingImpactSummarySchema>;

export const postingPlanSchema = z
  .object({
    postings: z.array(postingLineSchema),
    summary: postingImpactSummarySchema,
  })
  .meta({ id: "PostingPlan" });

export type PostingPlan = z.infer<typeof postingPlanSchema>;

// ---------------------------------------------------------------------------
// Expense input
// ---------------------------------------------------------------------------

/**
 * One source of money for an expense. A book account is the book's own money;
 * associate personal funds create a payable to that associate for the full
 * line amount, whoever ends up benefiting.
 */
export const expensePaymentInputSchema = z
  .discriminatedUnion("sourceType", [
    z
      .object({
        sourceType: z.literal("BOOK_ACCOUNT"),
        sourceAccountId: idSchema,
        paymentMethod: paymentMethodSchema,
        amountMinor: amountMinorSchema,
      })
      .strict(),
    z
      .object({
        sourceType: z.literal("ASSOCIATE_PERSONAL_FUNDS"),
        payerAssociateId: idSchema,
        paymentMethod: paymentMethodSchema,
        amountMinor: amountMinorSchema,
      })
      .strict(),
  ])
  .meta({ id: "ExpensePaymentInput" });

export type ExpensePaymentInput = z.infer<typeof expensePaymentInputSchema>;

/**
 * Who received the benefit. `COMMON` is shared by the whole book and never
 * creates a settlement; `ASSOCIATE_SPECIFIC` names one beneficiary and does.
 */
export const economicAllocationInputSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("COMMON"),
        amountMinor: amountMinorSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("ASSOCIATE_SPECIFIC"),
        associateId: idSchema,
        amountMinor: amountMinorSchema,
      })
      .strict(),
  ])
  .meta({ id: "EconomicAllocationInput" });

export type EconomicAllocationInput = z.infer<
  typeof economicAllocationInputSchema
>;

export const financialDocumentInputSchema = z
  .object({
    type: financialDocumentTypeSchema,
    documentNumber: nullableTrimmedStringSchema(MAX_CODE_LENGTH).optional(),
    issuedAt: isoTimestampSchema.optional(),
    supplierName: nullableTrimmedStringSchema(MAX_SUPPLIER_LENGTH).optional(),
    supplierTaxId: nullableTrimmedStringSchema(MAX_CODE_LENGTH).optional(),
    storageKey: nullableTrimmedStringSchema(MAX_STORAGE_KEY_LENGTH).optional(),
    notes: nullableTrimmedStringSchema(MAX_NOTES_LENGTH).optional(),
  })
  .strict()
  .meta({ id: "FinancialDocumentInput" });

export type FinancialDocumentInput = z.infer<
  typeof financialDocumentInputSchema
>;

/**
 * Issue messages raised by the expense cross-field checks. Clients match on
 * them to swap in a localized message, so schema and UI cannot drift apart.
 */
export const PAYMENTS_TOTAL_MESSAGE =
  "Payments must add up to the expense amount.";
export const ALLOCATIONS_TOTAL_MESSAGE =
  "Benefit allocations must add up to the expense amount.";
export const DUPLICATE_ALLOCATION_MESSAGE =
  "Each associate can only appear once in the benefit allocation.";

const sumAmounts = (lines: ReadonlyArray<{ amountMinor: number }>): number =>
  lines.reduce((total, line) => total + line.amountMinor, 0);

export const createExpenseInputSchema = z
  .object({
    bookId: idSchema,
    occurredAt: isoTimestampSchema,
    description: nullableTrimmedStringSchema(MAX_DESCRIPTION_LENGTH).optional(),
    amountMinor: amountMinorSchema,
    treatment: expenseTreatmentSchema,
    categoryId: idSchema,
    costObjectId: idSchema.optional(),
    payments: z.array(expensePaymentInputSchema).min(1).max(MAX_PAYMENT_LINES),
    allocations: z
      .array(economicAllocationInputSchema)
      .min(1)
      .max(MAX_ALLOCATION_LINES),
    documents: z
      .array(financialDocumentInputSchema)
      .max(MAX_DOCUMENT_LINES)
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (sumAmounts(input.payments) !== input.amountMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["payments"],
        message: PAYMENTS_TOTAL_MESSAGE,
      });
    }

    if (sumAmounts(input.allocations) !== input.amountMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: ALLOCATIONS_TOTAL_MESSAGE,
      });
    }

    // One line per beneficiary keeps the settlement arithmetic auditable.
    const seen = new Set<string>();
    for (const [index, allocation] of input.allocations.entries()) {
      const key =
        allocation.type === "COMMON" ? "COMMON" : allocation.associateId;

      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["allocations", index],
          message: DUPLICATE_ALLOCATION_MESSAGE,
        });
      }

      seen.add(key);
    }
  })
  .meta({ id: "CreateExpenseInput" });

export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;

/**
 * Preview takes exactly the same body as create. One schema, one posting
 * policy — a preview can never disagree with what posting would do.
 */
export const previewExpenseInputSchema = createExpenseInputSchema;

export type PreviewExpenseInput = CreateExpenseInput;

// ---------------------------------------------------------------------------
// Associate funding input
// ---------------------------------------------------------------------------

export const fundingProofContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const createFundingProofDraftUploadInputSchema = z
  .object({
    contentType: fundingProofContentTypeSchema,
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict()
  .meta({ id: "CreateFundingProofDraftUploadInput" });

export type CreateFundingProofDraftUploadInput = z.infer<
  typeof createFundingProofDraftUploadInputSchema
>;

export const fundingProofDraftUploadSchema = z
  .object({
    uploadUrl: z.string().url(),
    uploadToken: z.string().min(1),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: isoTimestampSchema,
    maxBytes: z.number().int().positive(),
  })
  .meta({ id: "FundingProofDraftUpload" });

export type FundingProofDraftUpload = z.infer<
  typeof fundingProofDraftUploadSchema
>;

export const createAssociateFundingInputSchema = z
  .object({
    bookId: idSchema,
    occurredAt: isoTimestampSchema,
    amountMinor: amountMinorSchema,
    type: associateFundingTypeSchema,
    associateId: idSchema,
    destinationAccountId: idSchema,
    reference: nullableTrimmedStringSchema(MAX_NAME_LENGTH).optional(),
    notes: nullableTrimmedStringSchema(MAX_NOTES_LENGTH).optional(),
    proofUploadToken: z.string().min(1).optional(),
  })
  .strict()
  .meta({ id: "CreateAssociateFundingInput" });

export type CreateAssociateFundingInput = z.infer<
  typeof createAssociateFundingInputSchema
>;

/** Preview excludes the proof because uploads never affect ledger postings. */
export const previewAssociateFundingInputSchema =
  createAssociateFundingInputSchema.omit({ proofUploadToken: true }).meta({
    id: "PreviewAssociateFundingInput",
  });

export type PreviewAssociateFundingInput = z.infer<
  typeof previewAssociateFundingInputSchema
>;

// ---------------------------------------------------------------------------
// Operation resources
// ---------------------------------------------------------------------------

export const ledgerAccountRefSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    category: ledgerAccountCategorySchema,
    role: ledgerAccountRoleSchema,
    associateId: z.string().nullable(),
  })
  .meta({ id: "LedgerAccountRef" });

export type LedgerAccountRef = z.infer<typeof ledgerAccountRefSchema>;

export const expensePaymentSchema = z
  .object({
    id: z.string(),
    sourceType: expensePaymentSourceTypeSchema,
    amountMinor: z.number().int(),
    paymentMethod: paymentMethodSchema,
    sourceAccountId: z.string().nullable(),
    sourceAccount: ledgerAccountRefSchema.nullable(),
    payerAssociateId: z.string().nullable(),
    payerAssociate: financeAssociateSchema.nullable(),
  })
  .meta({ id: "ExpensePayment" });

export type ExpensePayment = z.infer<typeof expensePaymentSchema>;

export const economicAllocationSchema = z
  .object({
    id: z.string(),
    type: economicAllocationTypeSchema,
    amountMinor: z.number().int(),
    associateId: z.string().nullable(),
    associate: financeAssociateSchema.nullable(),
  })
  .meta({ id: "EconomicAllocation" });

export type EconomicAllocation = z.infer<typeof economicAllocationSchema>;

export const financialDocumentSchema = z
  .object({
    id: z.string(),
    type: financialDocumentTypeSchema,
    documentNumber: z.string().nullable(),
    issuedAt: isoTimestampSchema.nullable(),
    supplierName: z.string().nullable(),
    supplierTaxId: z.string().nullable(),
    storageKey: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .meta({ id: "FinancialDocument" });

export type FinancialDocument = z.infer<typeof financialDocumentSchema>;

export const expenseDetailSchema = z
  .object({
    id: z.string(),
    amountMinor: z.number().int(),
    treatment: expenseTreatmentSchema,
    categoryId: z.string(),
    category: expenseCategorySchema.nullable(),
    costObjectId: z.string().nullable(),
    costObject: costObjectSchema.nullable(),
    payments: z.array(expensePaymentSchema),
  })
  .meta({ id: "ExpenseDetail" });

export type ExpenseDetail = z.infer<typeof expenseDetailSchema>;

export const associateFundingDetailSchema = z
  .object({
    id: z.string(),
    type: associateFundingTypeSchema,
    associateId: z.string(),
    associate: financeAssociateSchema,
    destinationAccountId: z.string(),
    destinationAccount: ledgerAccountRefSchema,
    amountMinor: z.number().int(),
    reference: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .meta({ id: "AssociateFundingDetail" });

export type AssociateFundingDetail = z.infer<
  typeof associateFundingDetailSchema
>;

export const journalPostingSchema = z
  .object({
    id: z.string(),
    lineNumber: z.number().int(),
    accountId: z.string(),
    account: ledgerAccountRefSchema,
    signedAmountMinor: signedAmountMinorSchema,
    description: z.string().nullable(),
  })
  .meta({ id: "JournalPosting" });

export type JournalPosting = z.infer<typeof journalPostingSchema>;

export const journalEntrySchema = z
  .object({
    id: z.string(),
    postedAt: isoTimestampSchema,
    postings: z.array(journalPostingSchema),
  })
  .meta({ id: "JournalEntry" });

export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const financialOperationSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    bookType: financeBookTypeSchema,
    kind: financialOperationKindSchema,
    status: financialOperationStatusSchema,
    occurredAt: isoTimestampSchema,
    description: z.string().nullable(),
    idempotencyKey: z.string(),
    createdById: z.string(),
    postedAt: isoTimestampSchema.nullable(),
    /** Set on a REVERSAL: the operation it undoes. */
    reversalOfOperationId: z.string().nullable(),
    /** Set on a reversed operation: the REVERSAL that undid it. */
    reversedByOperationId: z.string().nullable(),
    expense: expenseDetailSchema.nullable(),
    associateFunding: associateFundingDetailSchema.nullable(),
    allocations: z.array(economicAllocationSchema),
    documents: z.array(financialDocumentSchema),
    journalEntry: journalEntrySchema.nullable(),
    /** Recomputed from the persisted postings, not stored. */
    summary: postingImpactSummarySchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .meta({ id: "FinancialOperation" });

export type FinancialOperation = z.infer<typeof financialOperationSchema>;

export const financialOperationListItemSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    bookType: financeBookTypeSchema,
    kind: financialOperationKindSchema,
    status: financialOperationStatusSchema,
    occurredAt: isoTimestampSchema,
    description: z.string().nullable(),
    /** Absolute size of the operation, for list display. */
    amountMinor: z.number().int(),
    treatment: expenseTreatmentSchema.nullable(),
    categoryName: z.string().nullable(),
    costObjectName: z.string().nullable(),
    postedAt: isoTimestampSchema.nullable(),
    createdAt: isoTimestampSchema,
  })
  .meta({ id: "FinancialOperationListItem" });

export type FinancialOperationListItem = z.infer<
  typeof financialOperationListItemSchema
>;

export const financialOperationListSchema = z
  .object({
    items: z.array(financialOperationListItemSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })
  .meta({ id: "FinancialOperationList" });

export type FinancialOperationList = z.infer<
  typeof financialOperationListSchema
>;

export const listFinancialOperationsQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    bookId: idSchema.optional(),
    bookType: financeBookTypeSchema.optional(),
    kind: financialOperationKindSchema.optional(),
    status: financialOperationStatusSchema.optional(),
    treatment: expenseTreatmentSchema.optional(),
    /** Inclusive lower bound on `occurredAt`. */
    from: isoTimestampSchema.optional(),
    /** Exclusive upper bound on `occurredAt`. */
    to: isoTimestampSchema.optional(),
  })
  .strict()
  .meta({ id: "ListFinancialOperationsQuery" });

export type ListFinancialOperationsQuery = z.infer<
  typeof listFinancialOperationsQuerySchema
>;

export const reverseOperationInputSchema = z
  .object({
    /** Defaults to now when omitted. */
    occurredAt: isoTimestampSchema.optional(),
    reason: nullableTrimmedStringSchema(MAX_DESCRIPTION_LENGTH).optional(),
  })
  .strict()
  .meta({ id: "ReverseOperationInput" });

export type ReverseOperationInput = z.infer<typeof reverseOperationInputSchema>;

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export const previewSettlementInputSchema = z
  .object({
    bookId: idSchema,
    kind: settlementRunKindSchema,
    /** Inclusive. */
    periodStart: isoTimestampSchema,
    /** Exclusive. */
    periodEnd: isoTimestampSchema,
  })
  .strict()
  .refine((input) => input.periodStart < input.periodEnd, {
    message: "The period must end after it starts.",
    path: ["periodEnd"],
  })
  .meta({ id: "PreviewSettlementInput" });

export type PreviewSettlementInput = z.infer<
  typeof previewSettlementInputSchema
>;

export const settlementShareSchema = z
  .object({
    associateId: z.string(),
    associate: financeAssociateSchema.nullable(),
    shareBasisPoints: z.number().int(),
  })
  .meta({ id: "SettlementShare" });

export type SettlementShare = z.infer<typeof settlementShareSchema>;

export const settlementLineSchema = z
  .object({
    associateId: z.string(),
    associate: financeAssociateSchema.nullable(),
    shareBasisPoints: z.number().int(),
    /** Benefit actually received (or pool cash actually held). */
    actualAmountMinor: z.number().int(),
    /** Benefit the ownership share entitles them to. */
    expectedAmountMinor: z.number().int(),
    /** Positive = must receive. Negative = must pay. Always sums to zero. */
    adjustmentMinor: z.number().int(),
  })
  .meta({ id: "SettlementLine" });

export type SettlementLine = z.infer<typeof settlementLineSchema>;

export const settlementTransferSchema = z
  .object({
    fromAssociateId: z.string(),
    fromAssociate: financeAssociateSchema.nullable(),
    toAssociateId: z.string(),
    toAssociate: financeAssociateSchema.nullable(),
    amountMinor: z.number().int(),
  })
  .meta({ id: "SettlementTransfer" });

export type SettlementTransfer = z.infer<typeof settlementTransferSchema>;

/**
 * A calculated settlement. These transfers are private balancing payments
 * between associates; they are deliberately NOT netted against whatever the
 * company separately owes an associate for money they advanced.
 */
export const settlementPreviewSchema = z
  .object({
    bookId: z.string(),
    kind: settlementRunKindSchema,
    periodStart: isoTimestampSchema,
    periodEnd: isoTimestampSchema,
    /** Total specific benefit (or total pool cash) being shared out. */
    totalAmountMinor: z.number().int(),
    shares: z.array(settlementShareSchema),
    lines: z.array(settlementLineSchema),
    transfers: z.array(settlementTransferSchema),
    /** Operations included in this calculation. */
    operationIds: z.array(z.string()),
    calculatedAt: isoTimestampSchema,
  })
  .meta({ id: "SettlementPreview" });

export type SettlementPreview = z.infer<typeof settlementPreviewSchema>;
