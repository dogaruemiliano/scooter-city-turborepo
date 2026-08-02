import { describe, expect, it } from "vitest";

import {
  availableExpensePaymentSources,
  buildCompactExpensePayload,
  changeExpenseAttributionTarget,
  changeExpenseCompanyCuiAnswer,
  changeExpensePaymentSource,
  clearExpenseErrorsForAction,
  createExpenseFormState,
  expenseFundingTreatmentFor,
  expenseFormReducer,
  expenseReviewWarnings,
  expenseVatSummary,
  isExpensePaymentCombinationAllowed,
  normalizeExpenseAmountInput,
  resetExpenseFiscalAssertions,
  validateExpenseDetails,
  validateExpenseEvidence,
  type ExpenseAttributionTarget,
  type ExpenseEvidenceReference,
  type ExpenseFormState,
  type ExpenseFundingTreatment,
  type ExpensePaymentSource,
} from "../_lib/expense-form";

const fiscalEvidence: ExpenseEvidenceReference = {
  fileName: "invoice.pdf",
  contentType: "application/pdf",
  byteSize: 1_024,
  sha256: "a".repeat(64),
};

const posEvidence: ExpenseEvidenceReference = {
  fileName: "pos.jpg",
  contentType: "image/jpeg",
  byteSize: 2_048,
  sha256: "b".repeat(64),
};

function completeState(): ExpenseFormState {
  return {
    ...createExpenseFormState({
      currentUserId: "user-payer",
      defaultBusinessEntityId: "entity-1",
      today: "2026-08-01",
    }),
    hasCompanyCui: "YES",
    grossAmount: "1250",
    categoryId: "category-1",
    companyWalletId: "wallet-card",
    payeeCounterpartyId: "counterparty-1",
    documentType: "INVOICE",
    documentNumber: "FCT 1234",
    documentDate: "2026-08-01",
    supplierCui: "ro12345678",
    buyerCuiStatus: "MATCHED",
    vatLines: [
      {
        id: "vat-1",
        netAmount: "1050.42",
        ratePercent: "19",
        vatAmount: "199.58",
      },
    ],
  };
}

describe.each<
  [
    ExpensePaymentSource,
    ExpenseAttributionTarget,
    boolean,
    ExpenseFundingTreatment,
  ]
>([
  ["COMPANY_CARD", "BUSINESS", true, "NON_REIMBURSABLE"],
  ["COMPANY_CARD", "OWNER", true, "NON_REIMBURSABLE"],
  ["COMPANY_CASH_DESK", "BUSINESS", true, "NON_REIMBURSABLE"],
  ["COMPANY_CASH_DESK", "OWNER", true, "NON_REIMBURSABLE"],
  ["PERSONAL_FUNDS", "BUSINESS", true, "REIMBURSABLE"],
  ["PERSONAL_FUNDS", "OWNER", true, "NON_REIMBURSABLE"],
])("expense funding matrix", (source, target, allowed, treatment) => {
  it(`${source} + ${target}`, () => {
    expect(isExpensePaymentCombinationAllowed(source, target)).toBe(allowed);
    expect(expenseFundingTreatmentFor(source, target)).toBe(treatment);
  });
});

describe("expense form transitions", () => {
  it("defaults manual evidence classification to a fiscal receipt", () => {
    expect(
      createExpenseFormState({
        currentUserId: "user-payer",
        today: "2026-08-01",
      }).documentType,
    ).toBe("FISCAL_RECEIPT");
  });

  it("keeps owner attribution when central cash desk is selected", () => {
    const state = {
      ...completeState(),
      attributionTarget: "OWNER" as const,
      businessOwnerId: "owner-1",
    };

    expect(
      changeExpensePaymentSource(state, "COMPANY_CASH_DESK"),
    ).toMatchObject({
      paymentSource: "COMPANY_CASH_DESK",
      attributionTarget: "OWNER",
      businessOwnerId: "owner-1",
    });
  });

  it("keeps central cash desk when a specific owner is selected", () => {
    const state = {
      ...completeState(),
      paymentSource: "COMPANY_CASH_DESK" as const,
      companyWalletId: "wallet-cash",
    };

    expect(changeExpenseAttributionTarget(state, "OWNER")).toMatchObject({
      paymentSource: "COMPANY_CASH_DESK",
      attributionTarget: "OWNER",
      companyWalletId: "wallet-cash",
    });
    expect(availableExpensePaymentSources("OWNER")).toEqual([
      "COMPANY_CARD",
      "COMPANY_CASH_DESK",
      "PERSONAL_FUNDS",
    ]);
  });

  it("forces personal funds and company attribution when the receipt has no CUI", () => {
    expect(
      changeExpenseCompanyCuiAnswer(completeState(), "NO", "user-payer"),
    ).toMatchObject({
      hasCompanyCui: "NO",
      paymentSource: "PERSONAL_FUNDS",
      companyWalletId: "",
      fundedByUserId: "user-payer",
      paidByUserId: "user-payer",
      attributionTarget: "BUSINESS",
      businessOwnerId: "",
      buyerCuiStatus: "MISSING",
    });
  });

  it("marks the buyer CUI as matched when Yes is selected", () => {
    const personal = changeExpenseCompanyCuiAnswer(
      completeState(),
      "NO",
      "user-payer",
    );

    expect(
      changeExpenseCompanyCuiAnswer(personal, "YES", "user-payer"),
    ).toMatchObject({
      hasCompanyCui: "YES",
      paymentSource: "COMPANY_CARD",
      fundedByUserId: "",
      buyerCuiStatus: "MATCHED",
    });
  });

  it("clears an incompatible wallet when the company payment source changes", () => {
    const cardState = {
      ...completeState(),
      paymentSource: "COMPANY_CARD" as const,
      companyWalletId: "wallet-card",
    };

    expect(
      changeExpensePaymentSource(cardState, "COMPANY_CASH_DESK"),
    ).toMatchObject({
      paymentSource: "COMPANY_CASH_DESK",
      companyWalletId: "",
    });

    expect(
      changeExpensePaymentSource(
        { ...cardState, paymentSource: "COMPANY_CASH_DESK" },
        "COMPANY_CARD",
      ),
    ).toMatchObject({
      paymentSource: "COMPANY_CARD",
      companyWalletId: "",
    });
  });

  it("adds VAT lines without assuming a tax rate", () => {
    const state = createExpenseFormState({
      currentUserId: "user-payer",
      today: "2026-08-01",
    });

    const next = expenseFormReducer(state, {
      type: "ADD_VAT_LINE",
      id: "vat-1",
    });
    expect(next.vatLines).toEqual([
      { id: "vat-1", netAmount: "", ratePercent: "", vatAmount: "" },
    ]);
  });

  it("resets document assertions and VAT lines when evidence context changes", () => {
    expect(resetExpenseFiscalAssertions(completeState())).toMatchObject({
      documentType: "FISCAL_RECEIPT",
      documentNumber: "",
      documentDate: "",
      supplierCui: "",
      documentBuyerCui: "",
      buyerCuiStatus: "MATCHED",
      vatLines: [],
    });

    expect(
      expenseFormReducer(completeState(), {
        type: "SET_BUSINESS_ENTITY",
        businessEntityId: "entity-2",
        currency: "EUR",
      }),
    ).toMatchObject({
      businessEntityId: "entity-2",
      currency: "EUR",
      companyWalletId: "",
      businessOwnerId: "",
      documentType: "FISCAL_RECEIPT",
      documentNumber: "",
      vatLines: [],
    });
  });

  it("clears a field error as soon as the field is corrected", () => {
    expect(
      clearExpenseErrorsForAction(
        { grossAmount: "Invalid", categoryId: "Required" },
        { type: "SET_FIELD", field: "grossAmount", value: "100" },
      ),
    ).toEqual({ categoryId: "Required" });
  });
});

describe("Romanian expense amount input", () => {
  it.each([
    ["1.000", "1000"],
    ["1.000,50", "1000.50"],
    ["1000,50", "1000.50"],
    ["1000.50", "1000.50"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeExpenseAmountInput(input, "ro")).toBe(expected);
  });

  it.each(["1.00.0", "12.34,5", "1,000.50"])(
    "leaves malformed or ambiguous input %s untouched",
    (input) => {
      expect(normalizeExpenseAmountInput(input, "ro")).toBe(input);
    },
  );

  it("does not reinterpret English input", () => {
    expect(normalizeExpenseAmountInput("1.000", "en")).toBe("1.000");
  });
});

describe("compact expense payload", () => {
  it("maps v1 to one payment, one 100% attribution, and manual documents", () => {
    const payload = buildCompactExpensePayload(completeState(), {
      idempotencyKey: "web:create:expense-1",
      fiscalEvidence,
      posEvidence,
      legalEntityTaxIdentifier: "ro87654321",
    });

    expect(payload).toMatchObject({
      legalEntityId: "entity-1",
      payeeId: "counterparty-1",
      occurredOn: "2026-08-01",
      grossAmount: "1250.00",
      postImmediately: true,
      payment: {
        source: "COMPANY_CARD",
        companyWalletId: "wallet-card",
        paidByUserId: "user-payer",
        amount: "1250.00",
        paidOn: "2026-08-01",
      },
      attribution: { target: "BUSINESS" },
      taxLines: [
        {
          vatRate: "19",
          netAmount: "1050.42",
          vatAmount: "199.58",
          grossAmount: "1250.00",
          deductiblePercent: "0",
        },
      ],
      documents: [
        {
          type: "INVOICE",
          documentNumber: "FCT 1234",
          supplierTaxIdentifier: "RO12345678",
          buyerTaxIdentifier: "RO87654321",
          buyerCuiStatus: "MATCHED",
        },
        {
          type: "POS_RECEIPT",
          buyerCuiStatus: "NOT_APPLICABLE",
        },
      ],
    });
  });

  it("maps company cash + owner with its company wallet", () => {
    const state = {
      ...completeState(),
      paymentSource: "COMPANY_CASH_DESK" as const,
      companyWalletId: "wallet-cash",
      attributionTarget: "OWNER" as const,
      businessOwnerId: "business-owner-1",
    };

    const payload = buildCompactExpensePayload(state, {
      idempotencyKey: "web:create:expense-2",
      fiscalEvidence,
      posEvidence: null,
      legalEntityTaxIdentifier: "RO87654321",
    });

    expect(payload?.payment).toEqual({
      source: "COMPANY_CASH_DESK",
      companyWalletId: "wallet-cash",
      paidByUserId: "user-payer",
      amount: "1250.00",
      paidOn: "2026-08-01",
    });
    expect(payload?.attribution).toEqual({
      target: "OWNER",
      businessOwnerId: "business-owner-1",
    });
  });

  it("rejects personal funds when the receipt is declared to have company CUI", () => {
    const state = {
      ...completeState(),
      paymentSource: "PERSONAL_FUNDS" as const,
      companyWalletId: "",
      fundedByUserId: "user-funder",
    };

    expect(
      buildCompactExpensePayload(state, {
        idempotencyKey: "web:create:expense-invalid-cui-source",
        fiscalEvidence,
        posEvidence: null,
        legalEntityTaxIdentifier: "RO87654321",
      }),
    ).toBeNull();
  });

  it("does not allow POS evidence to contribute a VAT line", () => {
    const payload = buildCompactExpensePayload(completeState(), {
      idempotencyKey: "web:create:expense-3",
      fiscalEvidence,
      posEvidence,
      legalEntityTaxIdentifier: "RO87654321",
    });

    expect(
      payload?.documents.filter((item) => item.type === "POS_RECEIPT"),
    ).toHaveLength(1);
    expect(payload?.taxLines).toHaveLength(1);
  });

  it("allows optional evidence to be marked unavailable", () => {
    const state = {
      ...completeState(),
      hasCompanyCui: "NO" as const,
      paymentSource: "PERSONAL_FUNDS" as const,
      companyWalletId: "",
      fundedByUserId: "user-payer",
      attributionTarget: "BUSINESS" as const,
      documentNumber: "",
      documentDate: "",
      supplierCui: "",
      buyerCuiStatus: "NOT_REVIEWED" as const,
    };
    const payload = buildCompactExpensePayload(state, {
      idempotencyKey: "web:create:expense-4",
      fiscalEvidence: null,
      posEvidence: null,
    });

    expect(payload?.documents).toEqual([]);
  });

  it("allows a no-CUI expense without any document", () => {
    const state = {
      ...completeState(),
      hasCompanyCui: "NO" as const,
      paymentSource: "PERSONAL_FUNDS" as const,
      companyWalletId: "",
      fundedByUserId: "user-payer",
      attributionTarget: "BUSINESS" as const,
      documentNumber: "",
      documentDate: "",
      supplierCui: "",
      buyerCuiStatus: "NOT_REVIEWED" as const,
      vatLines: [],
    };
    const payload = buildCompactExpensePayload(state, {
      idempotencyKey: "web:create:expense-pos-only",
      fiscalEvidence: null,
      posEvidence: null,
    });

    expect(payload?.documents).toEqual([]);
  });

  it("marks an optional document as missing the buyer CUI for no-CUI expenses", () => {
    const state = changeExpenseCompanyCuiAnswer(
      completeState(),
      "NO",
      "user-payer",
    );
    const payload = buildCompactExpensePayload(state, {
      idempotencyKey: "web:create:expense-no-cui-document",
      fiscalEvidence,
      posEvidence: null,
      isVatRegistered: true,
    });

    expect(payload?.payment.source).toBe("PERSONAL_FUNDS");
    expect(payload?.documents).toEqual([
      expect.objectContaining({
        type: "FISCAL_RECEIPT",
        buyerCuiStatus: "MISSING",
        reviewStatus: "CONFIRMED",
      }),
    ]);
    expect(payload?.taxLines).toEqual([]);
  });

  it("does not build a matched-CUI expense without the company identifier", () => {
    expect(
      buildCompactExpensePayload(completeState(), {
        idempotencyKey: "web:create:expense-missing-company-cui",
        fiscalEvidence,
        posEvidence,
        legalEntityTaxIdentifier: null,
      }),
    ).toBeNull();
  });
});

describe("expense validation and review", () => {
  it("requires the source-dependent fields", () => {
    const errors = validateExpenseDetails(
      {
        ...completeState(),
        paymentSource: "PERSONAL_FUNDS",
        companyWalletId: "",
        fundedByUserId: "",
      },
      "Required",
      "Invalid amount",
      "Invalid combination",
    );

    expect(errors.fundedByUserId).toBe("Required");
    expect(errors.companyWalletId).toBeUndefined();
  });

  it("requires an explicit answer about the company CUI", () => {
    const errors = validateExpenseDetails(
      { ...completeState(), hasCompanyCui: "" },
      "Required",
      "Invalid amount",
      "Invalid combination",
    );

    expect(errors.hasCompanyCui).toBe("Required");
  });

  it("rejects personal funds in the Yes branch", () => {
    const errors = validateExpenseDetails(
      {
        ...completeState(),
        paymentSource: "PERSONAL_FUNDS",
        companyWalletId: "",
        fundedByUserId: "user-payer",
      },
      "Required",
      "Invalid amount",
      "Invalid combination",
    );

    expect(errors.paymentCombination).toBe("Invalid combination");
  });

  it("requires fiscal evidence and POS proof for company card payments", () => {
    const errors = validateExpenseEvidence(
      { ...completeState(), buyerCuiStatus: "NOT_REVIEWED" },
      { fiscalEvidence: null, posEvidence: null },
      "Required",
      "Invalid VAT",
    );

    expect(errors.fiscalEvidence).toBe("Required");
    expect(errors.posEvidence).toBe("Required");
  });

  it("requires only fiscal evidence for a company cash payment", () => {
    const errors = validateExpenseEvidence(
      {
        ...completeState(),
        paymentSource: "COMPANY_CASH_DESK",
        companyWalletId: "wallet-cash",
      },
      { fiscalEvidence: null, posEvidence: null },
      "Required",
      "Invalid VAT",
    );

    expect(errors.fiscalEvidence).toBe("Required");
    expect(errors.posEvidence).toBeUndefined();
  });

  it("keeps evidence optional when the receipt has no company CUI", () => {
    const state = changeExpenseCompanyCuiAnswer(
      completeState(),
      "NO",
      "user-payer",
    );
    const errors = validateExpenseEvidence(
      state,
      { fiscalEvidence: null, posEvidence: null },
      "Required",
      "Invalid VAT",
    );

    expect(errors.fiscalEvidence).toBeUndefined();
    expect(errors.posEvidence).toBeUndefined();
  });

  it("does not force document number or date when a file is attached", () => {
    const errors = validateExpenseEvidence(
      {
        ...completeState(),
        documentNumber: "",
        documentDate: "",
      },
      { fiscalEvidence, posEvidence },
      "Required",
      "Invalid VAT",
    );

    expect(errors.documentNumber).toBeUndefined();
    expect(errors.documentDate).toBeUndefined();
  });

  it("validates VAT arithmetic and reconciliation before submission", () => {
    const invalidFormula = validateExpenseEvidence(
      {
        ...completeState(),
        vatLines: [
          {
            id: "vat-1",
            netAmount: "100.00",
            ratePercent: "19",
            vatAmount: "18.99",
          },
        ],
      },
      { fiscalEvidence, posEvidence: null },
      "Required",
      "Invalid VAT",
    );
    expect(invalidFormula.vatLines).toBe("Invalid VAT");

    const invalidTotal = validateExpenseEvidence(
      {
        ...completeState(),
        vatLines: [
          {
            id: "vat-1",
            netAmount: "100.00",
            ratePercent: "19",
            vatAmount: "19.00",
          },
        ],
      },
      { fiscalEvidence, posEvidence: null },
      "Required",
      "Invalid VAT",
    );
    expect(invalidTotal.vatLines).toBe("Invalid VAT");

    const valid = validateExpenseEvidence(
      completeState(),
      { fiscalEvidence, posEvidence: null },
      "Required",
      "Invalid VAT",
    );
    expect(valid.vatLines).toBeUndefined();
  });

  it("keeps recoverable VAT at zero and recognizes the gross cost", () => {
    expect(expenseVatSummary(completeState())).toEqual({
      netAmount: "1050.42",
      vatAmount: "199.58",
      recoverableVatAmount: "0.00",
      recognizedCostAmount: "1250.00",
      documentTotal: "1250.00",
    });
  });

  it("surfaces manual mismatch warnings", () => {
    expect(
      expenseReviewWarnings({
        ...completeState(),
        documentDate: "2026-07-31",
        buyerCuiStatus: "MISMATCH",
        vatLines: [
          {
            id: "vat-1",
            netAmount: "1000",
            ratePercent: "19",
            vatAmount: "190",
          },
        ],
      }),
    ).toEqual([
      "DOCUMENT_DATE_DIFFERS",
      "BUYER_CUI_MISMATCH",
      "VAT_TOTAL_DIFFERS",
    ]);
  });
});
