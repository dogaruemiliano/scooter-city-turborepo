import { v1 } from "@repo/api-shared";

export const EXPENSE_PAYMENT_SOURCES = v1.finance.EXPENSE_PAYMENT_SOURCES;

export type ExpensePaymentSource = v1.finance.ExpensePaymentSource;

export const EXPENSE_ATTRIBUTION_TARGETS =
  v1.finance.EXPENSE_ATTRIBUTION_TARGETS;

export type ExpenseAttributionTarget = v1.finance.ExpenseAttributionTarget;

export type ExpenseFundingTreatment = v1.finance.ExpenseFundingTreatment;

export type ExpenseDocumentType = Extract<
  v1.finance.ExpenseDocumentType,
  "FISCAL_RECEIPT" | "INVOICE"
>;

export type ExpenseBuyerCuiStatus = v1.finance.ExpenseBuyerCuiStatus;

export type ExpenseCompanyCuiAnswer = "YES" | "NO" | "";

export interface ExpenseVatLineDraft {
  id: string;
  netAmount: string;
  ratePercent: string;
  vatAmount: string;
}

export interface ExpenseScooterAllocationDraft {
  scooterId: string;
  label: string;
  amount: string;
}

export interface ExpenseFormState {
  hasCompanyCui: ExpenseCompanyCuiAnswer;
  businessEntityId: string;
  grossAmount: string;
  currency: string;
  expenseDate: string;
  categoryId: string;
  paymentSource: ExpensePaymentSource;
  companyWalletId: string;
  fundedByUserId: string;
  payeeCounterpartyId: string;
  attributionTarget: ExpenseAttributionTarget;
  businessOwnerId: string;
  scooterAllocations: ExpenseScooterAllocationDraft[];
  paidByUserId: string;
  documentType: ExpenseDocumentType;
  documentNumber: string;
  documentDate: string;
  supplierCui: string;
  documentBuyerCui: string;
  buyerCuiStatus: ExpenseBuyerCuiStatus;
  vatLines: ExpenseVatLineDraft[];
}

export type ExpenseFormField = Exclude<
  keyof ExpenseFormState,
  | "hasCompanyCui"
  | "paymentSource"
  | "attributionTarget"
  | "vatLines"
  | "scooterAllocations"
>;

export type ExpenseFormAction =
  | {
      type: "SET_FIELD";
      field: ExpenseFormField;
      value: string;
    }
  | {
      type: "SET_COMPANY_CUI_ANSWER";
      value: Exclude<ExpenseCompanyCuiAnswer, "">;
      currentUserId: string;
    }
  | {
      type: "SET_BUSINESS_ENTITY";
      businessEntityId: string;
      currency: string;
    }
  | { type: "RESET_FISCAL_ASSERTIONS" }
  | { type: "SET_PAYMENT_SOURCE"; value: ExpensePaymentSource }
  | { type: "SET_ATTRIBUTION_TARGET"; value: ExpenseAttributionTarget }
  | { type: "ADD_VAT_LINE"; id: string }
  | { type: "REMOVE_VAT_LINE"; id: string }
  | {
      type: "UPDATE_VAT_LINE";
      id: string;
      field: Exclude<keyof ExpenseVatLineDraft, "id">;
      value: string;
    }
  | { type: "SET_SCOOTER_ALLOCATIONS"; value: ExpenseScooterAllocationDraft[] };

export interface ExpenseFormErrors {
  hasCompanyCui?: string;
  businessEntityId?: string;
  grossAmount?: string;
  currency?: string;
  expenseDate?: string;
  categoryId?: string;
  paymentCombination?: string;
  companyWalletId?: string;
  fundedByUserId?: string;
  payeeCounterpartyId?: string;
  businessOwnerId?: string;
  paidByUserId?: string;
  fiscalEvidence?: string;
  posEvidence?: string;
  documentType?: string;
  documentNumber?: string;
  documentDate?: string;
  buyerCuiStatus?: string;
  documentBuyerCui?: string;
  vatLines?: string;
}

export interface ExpenseEvidenceReference {
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  imageWidth?: number;
  imageHeight?: number;
  pageCount?: number;
}

export interface BuildExpensePayloadOptions {
  idempotencyKey: string;
  fiscalEvidence: ExpenseEvidenceReference | null;
  posEvidence: ExpenseEvidenceReference | null;
  legalEntityTaxIdentifier?: string | null;
  isVatRegistered?: boolean;
  postImmediately?: boolean;
}

export type CompactExpenseCreatePayload = v1.finance.CreateExpenseInput;

export interface ExpenseVatSummary {
  netAmount: string;
  vatAmount: string;
  recoverableVatAmount: string;
  recognizedCostAmount: string;
  documentTotal: string;
}

export type ExpenseReviewWarning =
  | "DOCUMENT_DATE_DIFFERS"
  | "BUYER_CUI_MISSING"
  | "BUYER_CUI_MISMATCH"
  | "VAT_TOTAL_DIFFERS";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/;
const POSITIVE_MONEY_PATTERN =
  /^(?!0(?:\.0{1,2})?$)(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/;
const RATE_PATTERN = /^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CANONICAL_DECIMAL_INPUT_PATTERN = /^\d+(?:\.\d{0,2})?$/;
const ROMANIAN_GROUPED_MONEY_INPUT_PATTERN =
  /^\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?$/;
const ROMANIAN_DECIMAL_INPUT_PATTERN = /^\d+(?:,\d{0,2})?$/;

export function normalizeExpenseAmountInput(value: string, locale: string) {
  if (!locale.toLowerCase().startsWith("ro")) return value;
  if (CANONICAL_DECIMAL_INPUT_PATTERN.test(value)) return value;
  if (ROMANIAN_GROUPED_MONEY_INPUT_PATTERN.test(value)) {
    return value.replaceAll(".", "").replace(",", ".");
  }
  if (ROMANIAN_DECIMAL_INPUT_PATTERN.test(value)) {
    return value.replace(",", ".");
  }
  return value;
}

export function createExpenseFormState(options: {
  currentUserId: string | null;
  defaultBusinessEntityId?: string;
  defaultCurrency?: string;
  today: string;
}): ExpenseFormState {
  return {
    hasCompanyCui: "",
    businessEntityId: options.defaultBusinessEntityId ?? "",
    grossAmount: "",
    currency: options.defaultCurrency ?? "RON",
    expenseDate: options.today,
    categoryId: "",
    paymentSource: "COMPANY_CARD",
    companyWalletId: "",
    fundedByUserId: "",
    payeeCounterpartyId: "",
    attributionTarget: "BUSINESS",
    businessOwnerId: "",
    scooterAllocations: [],
    paidByUserId: options.currentUserId ?? "",
    documentType: "FISCAL_RECEIPT",
    documentNumber: "",
    documentDate: "",
    supplierCui: "",
    documentBuyerCui: "",
    buyerCuiStatus: "NOT_REVIEWED",
    vatLines: [],
  };
}

export function expenseFormReducer(
  state: ExpenseFormState,
  action: ExpenseFormAction,
): ExpenseFormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_COMPANY_CUI_ANSWER":
      return changeExpenseCompanyCuiAnswer(
        state,
        action.value,
        action.currentUserId,
      );
    case "SET_BUSINESS_ENTITY":
      return resetExpenseFiscalAssertions({
        ...state,
        businessEntityId: action.businessEntityId,
        currency: action.currency,
        companyWalletId: "",
        businessOwnerId: "",
      });
    case "RESET_FISCAL_ASSERTIONS":
      return resetExpenseFiscalAssertions(state);
    case "SET_PAYMENT_SOURCE":
      return changeExpensePaymentSource(state, action.value);
    case "SET_ATTRIBUTION_TARGET":
      return changeExpenseAttributionTarget(state, action.value);
    case "ADD_VAT_LINE":
      return {
        ...state,
        vatLines: [
          ...state.vatLines,
          {
            id: action.id,
            netAmount: "",
            ratePercent: "",
            vatAmount: "",
          },
        ],
      };
    case "REMOVE_VAT_LINE":
      return {
        ...state,
        vatLines: state.vatLines.filter((line) => line.id !== action.id),
      };
    case "UPDATE_VAT_LINE":
      return {
        ...state,
        vatLines: state.vatLines.map((line) =>
          line.id === action.id
            ? { ...line, [action.field]: action.value }
            : line,
        ),
      };
    case "SET_SCOOTER_ALLOCATIONS":
      return { ...state, scooterAllocations: action.value };
  }
}

export function clearExpenseErrorsForAction(
  errors: ExpenseFormErrors,
  action: ExpenseFormAction,
): ExpenseFormErrors {
  const next = { ...errors };
  const clear = (...keys: Array<keyof ExpenseFormErrors>) => {
    for (const key of keys) delete next[key];
  };

  switch (action.type) {
    case "SET_FIELD":
      clear(action.field as keyof ExpenseFormErrors);
      break;
    case "SET_COMPANY_CUI_ANSWER":
      clear(
        "hasCompanyCui",
        "paymentCombination",
        "companyWalletId",
        "fundedByUserId",
        "businessOwnerId",
        "fiscalEvidence",
        "posEvidence",
        "documentType",
        "documentNumber",
        "documentDate",
        "buyerCuiStatus",
        "documentBuyerCui",
        "vatLines",
      );
      break;
    case "SET_BUSINESS_ENTITY":
      clear(
        "businessEntityId",
        "hasCompanyCui",
        "companyWalletId",
        "businessOwnerId",
        "fiscalEvidence",
        "posEvidence",
        "documentType",
        "documentNumber",
        "documentDate",
        "buyerCuiStatus",
        "documentBuyerCui",
        "vatLines",
      );
      break;
    case "RESET_FISCAL_ASSERTIONS":
      clear(
        "documentType",
        "documentNumber",
        "documentDate",
        "buyerCuiStatus",
        "documentBuyerCui",
        "vatLines",
      );
      break;
    case "SET_PAYMENT_SOURCE":
      clear(
        "paymentCombination",
        "companyWalletId",
        "fundedByUserId",
        "posEvidence",
      );
      break;
    case "SET_ATTRIBUTION_TARGET":
      clear("paymentCombination", "businessOwnerId");
      break;
    case "ADD_VAT_LINE":
    case "REMOVE_VAT_LINE":
    case "UPDATE_VAT_LINE":
      clear("vatLines");
      break;
  }

  return next;
}

export function resetExpenseFiscalAssertions(
  state: ExpenseFormState,
): ExpenseFormState {
  return {
    ...state,
    documentType: "FISCAL_RECEIPT",
    documentNumber: "",
    documentDate: "",
    supplierCui: "",
    documentBuyerCui: "",
    buyerCuiStatus:
      state.hasCompanyCui === "YES"
        ? "MATCHED"
        : state.hasCompanyCui === "NO"
          ? "MISSING"
          : "NOT_REVIEWED",
    vatLines: [],
  };
}

export function changeExpenseCompanyCuiAnswer(
  state: ExpenseFormState,
  answer: Exclude<ExpenseCompanyCuiAnswer, "">,
  currentUserId: string,
): ExpenseFormState {
  if (answer === "NO") {
    return resetExpenseFiscalAssertions({
      ...state,
      hasCompanyCui: answer,
      paymentSource: "PERSONAL_FUNDS",
      companyWalletId: "",
      fundedByUserId: currentUserId,
      paidByUserId: currentUserId,
      attributionTarget: "BUSINESS",
      businessOwnerId: "",
      buyerCuiStatus: "MISSING",
      documentBuyerCui: "",
    });
  }

  return resetExpenseFiscalAssertions({
    ...state,
    hasCompanyCui: answer,
    paymentSource:
      state.paymentSource === "PERSONAL_FUNDS"
        ? "COMPANY_CARD"
        : state.paymentSource,
    companyWalletId:
      state.paymentSource === "PERSONAL_FUNDS" ? "" : state.companyWalletId,
    fundedByUserId: "",
    buyerCuiStatus: "MATCHED",
    documentBuyerCui: "",
  });
}

export function changeExpensePaymentSource(
  state: ExpenseFormState,
  paymentSource: ExpensePaymentSource,
): ExpenseFormState {
  if (paymentSource === "COMPANY_CASH_DESK") {
    return {
      ...state,
      paymentSource,
      companyWalletId: "",
      fundedByUserId: "",
    };
  }

  if (paymentSource === "PERSONAL_FUNDS") {
    return {
      ...state,
      paymentSource,
      companyWalletId: "",
      fundedByUserId: state.fundedByUserId || state.paidByUserId,
    };
  }

  return {
    ...state,
    paymentSource,
    companyWalletId:
      state.paymentSource === paymentSource ? state.companyWalletId : "",
    fundedByUserId: "",
  };
}

export function changeExpenseAttributionTarget(
  state: ExpenseFormState,
  attributionTarget: ExpenseAttributionTarget,
): ExpenseFormState {
  if (attributionTarget === "BUSINESS") {
    return { ...state, attributionTarget, businessOwnerId: "" };
  }

  return { ...state, attributionTarget };
}

export function availableExpensePaymentSources(
  _attributionTarget: ExpenseAttributionTarget,
): ExpensePaymentSource[] {
  void _attributionTarget;
  return [...EXPENSE_PAYMENT_SOURCES];
}

export function isExpensePaymentCombinationAllowed(
  paymentSource: ExpensePaymentSource,
  attributionTarget: ExpenseAttributionTarget,
): boolean {
  return v1.finance.isExpensePaymentCombinationAllowed(
    paymentSource,
    attributionTarget,
  );
}

export function expenseFundingTreatmentFor(
  paymentSource: ExpensePaymentSource,
  attributionTarget: ExpenseAttributionTarget,
): ExpenseFundingTreatment {
  return v1.finance.expenseFundingTreatmentFor(
    paymentSource,
    attributionTarget,
  );
}

export function validateExpenseDetails(
  state: ExpenseFormState,
  requiredMessage: string,
  invalidAmountMessage: string,
  invalidCombinationMessage: string,
): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};

  if (!state.hasCompanyCui) errors.hasCompanyCui = requiredMessage;
  if (!state.businessEntityId) errors.businessEntityId = requiredMessage;
  if (!POSITIVE_MONEY_PATTERN.test(state.grossAmount.trim())) {
    errors.grossAmount = invalidAmountMessage;
  }
  if (!/^[A-Z]{3}$/.test(state.currency.trim().toUpperCase())) {
    errors.currency = requiredMessage;
  }
  if (!isValidDateOnly(state.expenseDate)) errors.expenseDate = requiredMessage;
  if (!state.categoryId) errors.categoryId = requiredMessage;
  if (
    (state.hasCompanyCui === "YES" &&
      state.paymentSource === "PERSONAL_FUNDS") ||
    (state.hasCompanyCui === "NO" &&
      (state.paymentSource !== "PERSONAL_FUNDS" ||
        state.attributionTarget !== "BUSINESS")) ||
    !isExpensePaymentCombinationAllowed(
      state.paymentSource,
      state.attributionTarget,
    )
  ) {
    errors.paymentCombination = invalidCombinationMessage;
  }
  if (state.paymentSource !== "PERSONAL_FUNDS" && !state.companyWalletId) {
    errors.companyWalletId = requiredMessage;
  }
  if (state.paymentSource === "PERSONAL_FUNDS" && !state.fundedByUserId) {
    errors.fundedByUserId = requiredMessage;
  }
  if (!state.payeeCounterpartyId) errors.payeeCounterpartyId = requiredMessage;
  if (state.attributionTarget === "OWNER" && !state.businessOwnerId) {
    errors.businessOwnerId = requiredMessage;
  }
  if (!state.paidByUserId) errors.paidByUserId = requiredMessage;

  return errors;
}

export function validateExpenseEvidence(
  state: ExpenseFormState,
  evidence: {
    fiscalEvidence: ExpenseEvidenceReference | null;
    posEvidence: ExpenseEvidenceReference | null;
  },
  requiredMessage: string,
  invalidVatMessage: string,
): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};

  if (state.hasCompanyCui === "YES" && !evidence.fiscalEvidence) {
    errors.fiscalEvidence = requiredMessage;
  }
  if (
    state.hasCompanyCui === "YES" &&
    state.paymentSource === "COMPANY_CARD" &&
    !evidence.posEvidence
  ) {
    errors.posEvidence = requiredMessage;
  }
  if (evidence.fiscalEvidence) {
    if (!state.documentType) errors.documentType = requiredMessage;
  }
  const grossMinor = moneyToMinor(state.grossAmount);
  const vatLineGrossMinor = state.vatLines.reduce<number | null>(
    (total, line) => {
      if (total === null) return null;
      const netMinor = moneyToMinor(line.netAmount);
      const vatMinor = moneyToMinor(line.vatAmount);
      return netMinor === null || vatMinor === null
        ? null
        : total + netMinor + vatMinor;
    },
    0,
  );
  if (
    state.vatLines.some((line) => !isValidVatLine(line)) ||
    (state.vatLines.length > 0 &&
      (grossMinor === null || vatLineGrossMinor !== grossMinor))
  ) {
    errors.vatLines = invalidVatMessage;
  }

  return errors;
}

export function buildCompactExpensePayload(
  state: ExpenseFormState,
  options: BuildExpensePayloadOptions,
): CompactExpenseCreatePayload | null {
  const fiscalEvidence = options.fiscalEvidence;
  if (
    !state.hasCompanyCui ||
    (state.hasCompanyCui === "YES" &&
      state.paymentSource === "PERSONAL_FUNDS") ||
    (state.hasCompanyCui === "NO" &&
      (state.paymentSource !== "PERSONAL_FUNDS" ||
        state.attributionTarget !== "BUSINESS")) ||
    (state.hasCompanyCui === "YES" && !fiscalEvidence) ||
    (state.hasCompanyCui === "YES" &&
      !options.legalEntityTaxIdentifier?.trim()) ||
    (state.hasCompanyCui === "YES" &&
      state.paymentSource === "COMPANY_CARD" &&
      !options.posEvidence) ||
    !isExpensePaymentCombinationAllowed(
      state.paymentSource,
      state.attributionTarget,
    )
  ) {
    return null;
  }

  const payment: v1.finance.ExpensePaymentInput = {
    source: state.paymentSource,
    paidByUserId: state.paidByUserId,
    amount: normalizeMoney(state.grossAmount),
    paidOn: state.expenseDate,
    ...(state.paymentSource === "PERSONAL_FUNDS"
      ? { fundedByUserId: state.fundedByUserId }
      : { companyWalletId: state.companyWalletId }),
  };

  const candidate: v1.finance.CreateExpenseInput = {
    idempotencyKey: options.idempotencyKey,
    legalEntityId: state.businessEntityId,
    grossAmount: normalizeMoney(state.grossAmount),
    currency: state.currency.trim().toUpperCase(),
    occurredOn: state.expenseDate,
    ...(state.documentDate ? { taxPointOn: state.documentDate } : {}),
    categoryId: state.categoryId,
    payeeId: state.payeeCounterpartyId,
    payment,
    attribution: {
      target: state.attributionTarget,
      ...(state.attributionTarget === "OWNER"
        ? { businessOwnerId: state.businessOwnerId }
        : {}),
    },
    references: [],
    scooterAllocations: state.scooterAllocations.map((allocation) => ({
      scooterId: allocation.scooterId,
      amount: normalizeMoney(allocation.amount),
    })),
    documents: [
      ...(fiscalEvidence
        ? [
            {
              type: state.documentType,
              ...(state.documentNumber.trim()
                ? { documentNumber: state.documentNumber.trim() }
                : {}),
              ...(state.documentDate ? { issuedOn: state.documentDate } : {}),
              ...(state.supplierCui.trim()
                ? {
                    supplierTaxIdentifier: state.supplierCui
                      .trim()
                      .toUpperCase(),
                  }
                : {}),
              ...(buyerTaxIdentifier(state, options)
                ? {
                    buyerTaxIdentifier: buyerTaxIdentifier(state, options),
                  }
                : {}),
              buyerCuiStatus:
                state.hasCompanyCui === "YES"
                  ? ("MATCHED" as const)
                  : ("MISSING" as const),
              reviewStatus: "CONFIRMED" as const,
            },
          ]
        : []),
      ...(options.posEvidence
        ? [
            {
              type: "POS_RECEIPT" as const,
              ...(state.documentDate ? { issuedOn: state.documentDate } : {}),
              buyerCuiStatus: "NOT_APPLICABLE" as const,
              reviewStatus: "CONFIRMED" as const,
            },
          ]
        : []),
    ],
    taxLines: state.vatLines.map((line) => {
      const netMinor = moneyToMinor(line.netAmount) ?? 0;
      const vatMinor = moneyToMinor(line.vatAmount) ?? 0;
      return {
        netAmount: minorToMoney(netMinor),
        vatRate: normalizeRate(line.ratePercent),
        vatAmount: minorToMoney(vatMinor),
        grossAmount: minorToMoney(netMinor + vatMinor),
        deductiblePercent:
          options.isVatRegistered && state.hasCompanyCui === "YES"
            ? "100"
            : "0",
      };
    }),
    postImmediately: options.postImmediately ?? true,
  };

  const result = v1.finance.createExpenseInputSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export type QuickExpensePaymentSource = Extract<
  ExpensePaymentSource,
  "PERSONAL_FUNDS" | "COMPANY_CASH_DESK" | "COMPANY_CARD"
>;

export interface QuickExpenseFormInput {
  categoryId: string;
  companyWalletId: string;
  currency: string;
  currentUserId: string;
  description: string;
  grossAmount: string;
  idempotencyKey: string;
  legalEntityId: string;
  occurredOn: string;
  paymentSource: QuickExpensePaymentSource;
  scooterAllocations: ExpenseScooterAllocationDraft[];
}

/**
 * Builds the payload for the ultra-lightweight "just spent money" entry
 * point: no payee, an optional category, and a single personal/business
 * payment toggle. Reuses the same `POST /finance/expenses` contract as the
 * full form.
 */
export function buildQuickExpensePayload(
  input: QuickExpenseFormInput,
): CompactExpenseCreatePayload | null {
  const payment: v1.finance.ExpensePaymentInput = {
    source: input.paymentSource,
    paidByUserId: input.currentUserId,
    amount: normalizeMoney(input.grossAmount),
    paidOn: input.occurredOn,
    ...(input.paymentSource === "PERSONAL_FUNDS"
      ? { fundedByUserId: input.currentUserId }
      : { companyWalletId: input.companyWalletId }),
  };

  const candidate: v1.finance.CreateExpenseInput = {
    idempotencyKey: input.idempotencyKey,
    legalEntityId: input.legalEntityId,
    grossAmount: normalizeMoney(input.grossAmount),
    currency: input.currency.trim().toUpperCase(),
    occurredOn: input.occurredOn,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    payment,
    attribution: { target: "BUSINESS" },
    notes: input.description.trim() || undefined,
    references: [],
    documents: [],
    taxLines: [],
    scooterAllocations: input.scooterAllocations.map((allocation) => ({
      scooterId: allocation.scooterId,
      amount: normalizeMoney(allocation.amount),
    })),
    postImmediately: true,
  };

  const result = v1.finance.createExpenseInputSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function expenseVatSummary(
  state: Pick<ExpenseFormState, "grossAmount" | "vatLines">,
  isVatRegistered = false,
): ExpenseVatSummary {
  let netMinor = 0;
  let vatMinor = 0;

  for (const line of state.vatLines) {
    netMinor += moneyToMinor(line.netAmount) ?? 0;
    vatMinor += moneyToMinor(line.vatAmount) ?? 0;
  }

  const recoverableVatMinor = isVatRegistered ? vatMinor : 0;
  const grossMinor = moneyToMinor(state.grossAmount) ?? 0;

  return {
    netAmount: minorToMoney(netMinor),
    vatAmount: minorToMoney(vatMinor),
    recoverableVatAmount: minorToMoney(recoverableVatMinor),
    recognizedCostAmount: minorToMoney(grossMinor - recoverableVatMinor),
    documentTotal: minorToMoney(netMinor + vatMinor),
  };
}

export function expenseReviewWarnings(
  state: ExpenseFormState,
): ExpenseReviewWarning[] {
  const warnings: ExpenseReviewWarning[] = [];
  const summary = expenseVatSummary(state);

  if (state.documentDate && state.documentDate !== state.expenseDate) {
    warnings.push("DOCUMENT_DATE_DIFFERS");
  }
  if (state.buyerCuiStatus === "MISSING" && state.hasCompanyCui !== "NO") {
    warnings.push("BUYER_CUI_MISSING");
  }
  if (state.buyerCuiStatus === "MISMATCH") {
    warnings.push("BUYER_CUI_MISMATCH");
  }
  if (
    state.vatLines.length > 0 &&
    moneyToMinor(summary.documentTotal) !== moneyToMinor(state.grossAmount)
  ) {
    warnings.push("VAT_TOTAL_DIFFERS");
  }

  return warnings;
}

export function hasExpenseFormErrors(errors: ExpenseFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * Splits a gross amount evenly across the given rows, assigning any leftover
 * cent remainder to the last row so the split always sums exactly to the
 * gross amount.
 */
export function splitScooterAllocationsEvenly(
  rows: ExpenseScooterAllocationDraft[],
  grossAmount: string,
): ExpenseScooterAllocationDraft[] {
  if (rows.length === 0) return rows;

  const totalMinor = moneyToMinor(grossAmount) ?? 0;
  const shareMinor = Math.floor(totalMinor / rows.length);
  const remainderMinor = totalMinor - shareMinor * rows.length;

  return rows.map((row, index) => ({
    ...row,
    amount: minorToMoney(
      index === rows.length - 1 ? shareMinor + remainderMinor : shareMinor,
    ),
  }));
}

export function scooterAllocationTotalMinor(
  rows: readonly ExpenseScooterAllocationDraft[],
): number {
  return rows.reduce(
    (total, row) => total + (moneyToMinor(row.amount) ?? 0),
    0,
  );
}

function isValidVatLine(line: ExpenseVatLineDraft): boolean {
  if (!MONEY_PATTERN.test(line.netAmount.trim())) return false;
  if (!MONEY_PATTERN.test(line.vatAmount.trim())) return false;
  if (!RATE_PATTERN.test(line.ratePercent.trim())) return false;

  const netMinor = moneyToMinor(line.netAmount);
  const vatMinor = moneyToMinor(line.vatAmount);
  if (netMinor === null || vatMinor === null) return false;

  const [rateWhole = "0", rateFraction = ""] = line.ratePercent
    .trim()
    .split(".");
  const rateHundredths =
    BigInt(rateWhole) * BigInt(100) + BigInt(rateFraction.padEnd(2, "0"));
  const denominator = BigInt(10_000);
  const expectedVatMinor =
    (BigInt(netMinor) * rateHundredths + denominator / BigInt(2)) / denominator;

  return expectedVatMinor === BigInt(vatMinor);
}

function buyerTaxIdentifier(
  state: ExpenseFormState,
  options: BuildExpensePayloadOptions,
): string | undefined {
  const value =
    state.hasCompanyCui === "YES" ? options.legalEntityTaxIdentifier : null;
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

function normalizeMoney(value: string): string {
  const minor = moneyToMinor(value);
  return minor === null ? value.trim() : minorToMoney(minor);
}

function normalizeRate(value: string): string {
  const normalized = value.trim().replace(/\.0+$/, "");
  return normalized || "0";
}

function moneyToMinor(value: string): number | null {
  const normalized = value.trim();
  if (!MONEY_PATTERN.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

export function minorToMoney(value: number): string {
  return `${Math.trunc(value / 100)}.${String(Math.abs(value % 100)).padStart(2, "0")}`;
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
