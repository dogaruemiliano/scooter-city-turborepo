/**
 * The expense form's own shape, and how it becomes an API request.
 *
 * The form collects money as text in major units — people type "300,50", not
 * "30050" — while the API only ever speaks minor units. Conversion happens
 * here and nowhere else, using the shared parser, so the form and the ledger
 * cannot disagree about what a number means.
 *
 * The cross-field rules (payments and benefits must each total the expense)
 * are enforced here *and* on the server. This copy exists to give the user an
 * answer without a round trip; the server's copy is the one that decides.
 */
import { v1 } from "@repo/api-shared";
import { z } from "zod";

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_NOTES_LENGTH = 2_000;
const MAX_SUPPLIER_LENGTH = 200;
const MAX_CODE_LENGTH = 64;

export const EXPENSE_FORM_FOCUS_FIELDS = [
  "bookId",
  "amount",
  "occurredAt",
  "treatment",
  "categoryId",
  "payments.0.sourceType",
  "payments.0.sourceAccountId",
  "payments.0.payerAssociateId",
  "payments.0.paymentMethod",
  "payments.0.amount",
  "allocations.0.type",
  "allocations.0.associateId",
  "allocations.0.amount",
] as const;

export type ExpenseFormFocusField = (typeof EXPENSE_FORM_FOCUS_FIELDS)[number];

const EXPENSE_FORM_FOCUS_FIELD_SET = new Set<string>(EXPENSE_FORM_FOCUS_FIELDS);

export function isExpenseFormFocusField(
  value: string | undefined,
): value is ExpenseFormFocusField {
  return Boolean(value && EXPENSE_FORM_FOCUS_FIELD_SET.has(value));
}

export function expenseFormFocusFieldForIssuePath(
  path: readonly PropertyKey[],
): ExpenseFormFocusField | undefined {
  const [section, , nestedField] = path.map(String);
  let candidate = path.map(String).join(".");

  if (section === "payments") {
    candidate = `payments.0.${nestedField ?? "amount"}`;
  } else if (section === "allocations") {
    candidate = `allocations.0.${nestedField ?? "amount"}`;
  }

  return isExpenseFormFocusField(candidate) ? candidate : undefined;
}

/** Issue codes the UI swaps for localized text. */
export const PAYMENTS_TOTAL_ISSUE = "finance.paymentsTotal";
export const ALLOCATIONS_TOTAL_ISSUE = "finance.allocationsTotal";
export const DUPLICATE_ALLOCATION_ISSUE = "finance.duplicateAllocation";

/**
 * A money field: required, parseable without rounding, and positive.
 *
 * Both checks live in one `superRefine` rather than two chained `refine`s.
 * Zod runs every refinement even after one fails, so a second check that
 * called the throwing parser would blow up on exactly the invalid input the
 * first check just rejected.
 */
const amountFieldSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    const minor = safeMinor(value);

    if (minor === undefined) {
      ctx.addIssue({ code: "custom", message: "finance.invalidAmount" });
      return;
    }

    if (minor <= 0) {
      ctx.addIssue({ code: "custom", message: "finance.amountMustBePositive" });
    }
  });

const optionalTextSchema = (max: number) => z.string().trim().max(max);

export const expensePaymentFieldSchema = z.object({
  sourceType: z.enum(v1.finance.EXPENSE_PAYMENT_SOURCE_TYPES),
  /** Required when paying from a book account; ignored otherwise. */
  sourceAccountId: z.string().trim(),
  /** Required when an associate paid personally; ignored otherwise. */
  payerAssociateId: z.string().trim(),
  paymentMethod: z.enum(v1.finance.PAYMENT_METHODS),
  amount: amountFieldSchema,
});

export const economicAllocationFieldSchema = z.object({
  type: z.enum(v1.finance.ECONOMIC_ALLOCATION_TYPES),
  /** Required only for a benefit attributed to one associate. */
  associateId: z.string().trim(),
  amount: amountFieldSchema,
});

export const financialDocumentFieldSchema = z.object({
  type: z.enum(v1.finance.FINANCIAL_DOCUMENT_TYPES),
  documentSeries: optionalTextSchema(MAX_CODE_LENGTH),
  documentNumber: optionalTextSchema(MAX_CODE_LENGTH),
  issuedAt: z.string().trim(),
  supplierName: optionalTextSchema(MAX_SUPPLIER_LENGTH),
  supplierTaxId: optionalTextSchema(MAX_CODE_LENGTH),
  notes: optionalTextSchema(MAX_NOTES_LENGTH),
});

export const expenseFormSchema = z
  .object({
    bookId: z.string().trim().min(1),
    supplierId: z.string().trim(),
    occurredAt: z.string().trim().min(1),
    description: optionalTextSchema(MAX_DESCRIPTION_LENGTH),
    amount: amountFieldSchema,
    treatment: z.enum(v1.finance.EXPENSE_TREATMENTS),
    categoryId: z.string().trim().min(1),
    costObjectId: z.string().trim(),
    payments: z.array(expensePaymentFieldSchema).min(1),
    allocations: z.array(economicAllocationFieldSchema).min(1),
    documents: z.array(financialDocumentFieldSchema),
  })
  .superRefine((values, ctx) => {
    for (const [index, payment] of values.payments.entries()) {
      if (payment.sourceType === "BOOK_ACCOUNT" && !payment.sourceAccountId) {
        ctx.addIssue({
          code: "custom",
          path: ["payments", index, "sourceAccountId"],
          message: "finance.required",
        });
      }

      if (
        payment.sourceType === "ASSOCIATE_PERSONAL_FUNDS" &&
        !payment.payerAssociateId
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["payments", index, "payerAssociateId"],
          message: "finance.required",
        });
      }
    }

    const seen = new Set<string>();
    for (const [index, allocation] of values.allocations.entries()) {
      if (allocation.type === "ASSOCIATE_SPECIFIC" && !allocation.associateId) {
        ctx.addIssue({
          code: "custom",
          path: ["allocations", index, "associateId"],
          message: "finance.required",
        });
      }

      const key =
        allocation.type === "COMMON" ? "COMMON" : allocation.associateId;
      if (key && seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["allocations", index, "associateId"],
          message: DUPLICATE_ALLOCATION_ISSUE,
        });
      }
      seen.add(key);
    }

    // Totals are only meaningful once every line parses.
    const amountMinor = safeMinor(values.amount);
    if (amountMinor === undefined) return;

    if (sumLines(values.payments) !== amountMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["payments"],
        message: PAYMENTS_TOTAL_ISSUE,
      });
    }

    if (sumLines(values.allocations) !== amountMinor) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: ALLOCATIONS_TOTAL_ISSUE,
      });
    }
  });

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

/** Parses an amount field, or `undefined` when it is not a valid amount. */
export function safeMinor(value: string): number | undefined {
  try {
    return v1.finance.parseMajorToMinor(value);
  } catch {
    return undefined;
  }
}

/** Total of a set of money lines; unparseable lines count as zero. */
export function sumLines(lines: ReadonlyArray<{ amount: string }>): number {
  return lines.reduce(
    (total, line) => total + (safeMinor(line.amount) ?? 0),
    0,
  );
}

export function emptyPaymentLine(
  defaults: Partial<ExpenseFormValues["payments"][number]> = {},
): ExpenseFormValues["payments"][number] {
  return {
    sourceType: "BOOK_ACCOUNT",
    sourceAccountId: "",
    payerAssociateId: "",
    paymentMethod: "BANK_TRANSFER",
    amount: "",
    ...defaults,
  };
}

export function emptyAllocationLine(
  defaults: Partial<ExpenseFormValues["allocations"][number]> = {},
): ExpenseFormValues["allocations"][number] {
  return {
    type: "COMMON",
    associateId: "",
    amount: "",
    ...defaults,
  };
}

export function emptyDocumentLine(): ExpenseFormValues["documents"][number] {
  return {
    type: "RECEIPT",
    documentSeries: "",
    documentNumber: "",
    issuedAt: "",
    supplierName: "",
    supplierTaxId: "",
    notes: "",
  };
}

export interface ExpenseFormDefaultsInput {
  bookId: string;
  today: string;
}

export function expenseFormDefaults({
  bookId,
  today,
}: ExpenseFormDefaultsInput): ExpenseFormValues {
  return {
    bookId,
    supplierId: "",
    occurredAt: today,
    description: "",
    amount: "",
    treatment: "OPERATING_EXPENSE",
    categoryId: "",
    costObjectId: "",
    payments: [emptyPaymentLine()],
    allocations: [emptyAllocationLine()],
    documents: [],
  };
}

export function expenseFormDefaultsFromExtraction(input: {
  extraction: v1.finance.NormalizedExpenseExtraction;
  books: readonly v1.finance.FinanceBook[];
  accounts: readonly v1.finance.LedgerAccount[];
  categories: readonly v1.finance.ExpenseCategory[];
  suppliers: readonly v1.finance.Supplier[];
  currentUserId: string;
  fallbackBook: v1.finance.FinanceBook;
  today: string;
}): ExpenseFormValues {
  const { extraction } = input;
  const book =
    input.books.find(
      (candidate) => candidate.type === extraction.suggestedBookType,
    ) ?? input.fallbackBook;
  const amount =
    extraction.amountMinor.value === null
      ? ""
      : v1.finance.formatMinorToMajor(extraction.amountMinor.value);
  const category = input.categories.find(
    (candidate) =>
      candidate.bookId === book.id &&
      candidate.code === extraction.suggestedCategoryCode,
  );
  const supplier = findMatchingSupplier(
    input.suppliers,
    extraction.supplierName.value,
    extraction.supplierTaxIdentifier.value,
  );
  const allowedTreatments =
    v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE[book.type];
  const treatment =
    category?.defaultTreatment &&
    allowedTreatments.includes(category.defaultTreatment)
      ? category.defaultTreatment
      : allowedTreatments[0];
  const sourceAccount =
    book.type === "COMPANY"
      ? (input.accounts.find(
          (account) =>
            account.bookId === book.id &&
            account.role === "BANK" &&
            account.isDefault,
        ) ??
        input.accounts.find(
          (account) =>
            account.bookId === book.id &&
            (
              v1.finance.EXPENSE_PAYMENT_SOURCE_ROLES as readonly string[]
            ).includes(account.role),
        ))
      : undefined;
  const hasDocumentDetails = [
    extraction.suggestedDocumentType === "INVOICE",
    extraction.documentSeries.value,
    extraction.documentNumber.value,
    extraction.occurredAt.value,
    extraction.supplierName.value,
    extraction.supplierTaxIdentifier.value,
  ].some(Boolean);

  return {
    ...expenseFormDefaults({ bookId: book.id, today: input.today }),
    supplierId: supplier?.id ?? "",
    occurredAt: extraction.occurredAt.value ?? input.today,
    description: extraction.supplierName.value ?? "",
    amount,
    treatment: treatment ?? "OPERATING_EXPENSE",
    categoryId: category?.id ?? "",
    payments: [
      emptyPaymentLine({
        sourceType:
          book.type === "ASSOCIATE_POOL"
            ? "ASSOCIATE_PERSONAL_FUNDS"
            : "BOOK_ACCOUNT",
        sourceAccountId: sourceAccount?.id ?? "",
        payerAssociateId:
          book.type === "ASSOCIATE_POOL" ? input.currentUserId : "",
        paymentMethod: extraction.suggestedPaymentMethod ?? "BANK_TRANSFER",
        amount,
      }),
    ],
    allocations: [
      emptyAllocationLine({
        type: extraction.suggestedAllocationType ?? "COMMON",
        amount,
      }),
    ],
    documents: hasDocumentDetails
      ? [
          {
            ...emptyDocumentLine(),
            type: extraction.suggestedDocumentType,
            documentSeries:
              extraction.suggestedDocumentType === "INVOICE"
                ? (extraction.documentSeries.value ?? "")
                : "",
            documentNumber: extraction.documentNumber.value ?? "",
            issuedAt: extraction.occurredAt.value ?? "",
            supplierName: extraction.supplierName.value ?? "",
            supplierTaxId: extraction.supplierTaxIdentifier.value ?? "",
          },
        ]
      : [],
  };
}

/**
 * Cost-object defaults prefill the benefit lines and nothing else.
 *
 * They never touch the payment side or the treatment: what a cost was *for*
 * says nothing about who paid or how it is booked. Returns `undefined` when
 * the cost object carries no default.
 */
export function allocationDefaultsForCostObject(
  costObject: v1.finance.CostObject | undefined,
  amount: string,
): ExpenseFormValues["allocations"] | undefined {
  if (!costObject?.defaultAllocationType) return undefined;

  if (costObject.defaultAllocationType === "COMMON") {
    return [emptyAllocationLine({ type: "COMMON", amount })];
  }

  if (!costObject.defaultBeneficiaryAssociateId) return undefined;

  return [
    emptyAllocationLine({
      type: "ASSOCIATE_SPECIFIC",
      associateId: costObject.defaultBeneficiaryAssociateId,
      amount,
    }),
  ];
}

/**
 * Converts validated form values into the API request body.
 *
 * Fields that do not apply to the chosen variant are dropped rather than sent
 * empty — the API's discriminated unions reject a book-account payment that
 * also names a payer, and rightly so.
 */
export function toCreateExpenseInput(
  values: ExpenseFormValues,
): v1.finance.CreateExpenseInput {
  return {
    bookId: values.bookId,
    ...(values.supplierId ? { supplierId: values.supplierId } : {}),
    occurredAt: dateToIsoTimestamp(values.occurredAt),
    ...(values.description ? { description: values.description } : {}),
    amountMinor: v1.finance.parseMajorToMinor(values.amount),
    treatment: values.treatment,
    categoryId: values.categoryId,
    ...(values.costObjectId ? { costObjectId: values.costObjectId } : {}),
    payments: values.payments.map((payment) =>
      payment.sourceType === "BOOK_ACCOUNT"
        ? {
            sourceType: "BOOK_ACCOUNT" as const,
            sourceAccountId: payment.sourceAccountId,
            paymentMethod: payment.paymentMethod,
            amountMinor: v1.finance.parseMajorToMinor(payment.amount),
          }
        : {
            sourceType: "ASSOCIATE_PERSONAL_FUNDS" as const,
            payerAssociateId: payment.payerAssociateId,
            paymentMethod: payment.paymentMethod,
            amountMinor: v1.finance.parseMajorToMinor(payment.amount),
          },
    ),
    allocations: values.allocations.map((allocation) =>
      allocation.type === "COMMON"
        ? {
            type: "COMMON" as const,
            amountMinor: v1.finance.parseMajorToMinor(allocation.amount),
          }
        : {
            type: "ASSOCIATE_SPECIFIC" as const,
            associateId: allocation.associateId,
            amountMinor: v1.finance.parseMajorToMinor(allocation.amount),
          },
    ),
    ...(values.documents.length > 0
      ? {
          documents: values.documents.map((document) => ({
            type: document.type,
            ...(document.type === "INVOICE" && document.documentSeries
              ? { documentSeries: document.documentSeries }
              : {}),
            ...(document.documentNumber
              ? { documentNumber: document.documentNumber }
              : {}),
            ...(document.issuedAt
              ? { issuedAt: dateToIsoTimestamp(document.issuedAt) }
              : {}),
            ...(document.supplierName
              ? { supplierName: document.supplierName }
              : {}),
            ...(document.supplierTaxId
              ? { supplierTaxId: document.supplierTaxId }
              : {}),
            ...(document.notes ? { notes: document.notes } : {}),
          })),
        }
      : {}),
  };
}

export function findMatchingSupplier(
  suppliers: readonly v1.finance.Supplier[],
  supplierName: string | null,
  supplierTaxIdentifier: string | null,
): v1.finance.Supplier | undefined {
  const normalizedTaxIdentifier = supplierTaxIdentifier
    ? normalizeSupplierTaxIdentifier(supplierTaxIdentifier)
    : "";
  if (normalizedTaxIdentifier) {
    return suppliers.find(
      (supplier) =>
        supplier.isActive &&
        normalizeSupplierTaxIdentifier(supplier.taxIdentifier) ===
          normalizedTaxIdentifier,
    );
  }

  const normalizedName = supplierName
    ? normalizeSupplierName(supplierName)
    : "";
  if (!normalizedName) return undefined;
  return suppliers.find(
    (supplier) =>
      supplier.isActive &&
      normalizeSupplierName(supplier.name) === normalizedName,
  );
}

function normalizeSupplierTaxIdentifier(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(CODFISCAL|CUI|CIF|VAT|CF)/, "")
    .replace(/^RO(?=\d)/, "");
}

function normalizeSupplierName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized
    .replace(/\bS R L\b/g, "SRL")
    .replace(/\bS A\b/g, "SA")
    .replace(/\bP F A\b/g, "PFA")
    .replace(/\bI I\b/g, "II");
}

/** A calendar date becomes midnight UTC — the ledger only cares about the day. */
export function dateToIsoTimestamp(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00.000Z`).toISOString();
}

/** Today as `YYYY-MM-DD`, for the date field's default. */
export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}
