import { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";

import {
  allocationDefaultsForCostObject,
  dateToIsoTimestamp,
  emptyAllocationLine,
  emptyPaymentLine,
  expenseFormDefaults,
  expenseFormDefaultsFromExtraction,
  expenseFormFocusFieldForIssuePath,
  expenseFormSchema,
  findMatchingSupplier,
  isExpenseFormFocusField,
  safeMinor,
  sumLines,
  toCreateExpenseInput,
  type ExpenseFormValues,
} from "../_lib/expense-form";

const BOOK_ID = "book-company";
const EMILIANO = "user-emiliano";
const IUSTI = "user-iusti";

function values(overrides: Partial<ExpenseFormValues> = {}): ExpenseFormValues {
  return {
    ...expenseFormDefaults({ bookId: BOOK_ID, today: "2026-08-14" }),
    amount: "300",
    categoryId: "category-fuel",
    payments: [
      emptyPaymentLine({ sourceAccountId: "account-bank", amount: "300" }),
    ],
    allocations: [emptyAllocationLine({ amount: "300" })],
    ...overrides,
  };
}

describe("expenseFormSchema", () => {
  it("accepts a complete, balanced expense", () => {
    expect(expenseFormSchema.safeParse(values()).success).toBe(true);
  });

  it("rejects payments that do not add up to the amount", () => {
    const result = expenseFormSchema.safeParse(
      values({
        payments: [
          emptyPaymentLine({ sourceAccountId: "account-bank", amount: "200" }),
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path.join(".") === "payments"),
    ).toBe(true);
  });

  it("rejects benefit allocations that do not add up to the amount", () => {
    const result = expenseFormSchema.safeParse(
      values({ allocations: [emptyAllocationLine({ amount: "200" })] }),
    );

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) => issue.path.join(".") === "allocations",
      ),
    ).toBe(true);
  });

  it("requires an account when the book paid", () => {
    const result = expenseFormSchema.safeParse(
      values({
        payments: [emptyPaymentLine({ sourceAccountId: "", amount: "300" })],
      }),
    );

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) => issue.path.join(".") === "payments.0.sourceAccountId",
      ),
    ).toBe(true);
  });

  it("requires a payer when an associate used their own money", () => {
    const result = expenseFormSchema.safeParse(
      values({
        payments: [
          emptyPaymentLine({
            sourceType: "ASSOCIATE_PERSONAL_FUNDS",
            amount: "300",
          }),
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) => issue.path.join(".") === "payments.0.payerAssociateId",
      ),
    ).toBe(true);
  });

  it("requires a beneficiary on a specific allocation", () => {
    const result = expenseFormSchema.safeParse(
      values({
        allocations: [
          emptyAllocationLine({ type: "ASSOCIATE_SPECIFIC", amount: "300" }),
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects two allocation lines for the same associate", () => {
    const result = expenseFormSchema.safeParse(
      values({
        allocations: [
          emptyAllocationLine({
            type: "ASSOCIATE_SPECIFIC",
            associateId: IUSTI,
            amount: "100",
          }),
          emptyAllocationLine({
            type: "ASSOCIATE_SPECIFIC",
            associateId: IUSTI,
            amount: "200",
          }),
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects an amount with more decimals than the currency has", () => {
    expect(
      expenseFormSchema.safeParse(values({ amount: "300.005" })).success,
    ).toBe(false);
  });

  it("rejects a zero amount", () => {
    const result = expenseFormSchema.safeParse(
      values({
        amount: "0",
        payments: [
          emptyPaymentLine({ sourceAccountId: "account-bank", amount: "0" }),
        ],
        allocations: [emptyAllocationLine({ amount: "0" })],
      }),
    );

    expect(result.success).toBe(false);
  });
});

describe("expense form focus fields", () => {
  it("accepts only the supported form paths", () => {
    expect(isExpenseFormFocusField("categoryId")).toBe(true);
    expect(isExpenseFormFocusField("documents.0.supplierName")).toBe(false);
    expect(isExpenseFormFocusField(undefined)).toBe(false);
  });

  it("normalizes collection issues to the first editable amount", () => {
    expect(expenseFormFocusFieldForIssuePath(["payments"])).toBe(
      "payments.0.amount",
    );
    expect(
      expenseFormFocusFieldForIssuePath(["allocations", 3, "amount"]),
    ).toBe("allocations.0.amount");
  });
});

describe("toCreateExpenseInput", () => {
  it("converts major-unit text into minor units", () => {
    const input = toCreateExpenseInput(values({ amount: "300.50" }));

    expect(input.amountMinor).toBe(30_050);
    expect(input.occurredAt).toBe("2026-08-14T00:00:00.000Z");
  });

  it("keeps payment and allocation lines independent", () => {
    const input = toCreateExpenseInput(
      values({
        amount: "400",
        payments: [
          emptyPaymentLine({
            sourceType: "ASSOCIATE_PERSONAL_FUNDS",
            payerAssociateId: IUSTI,
            paymentMethod: "CARD",
            amount: "400",
          }),
        ],
        allocations: [
          emptyAllocationLine({
            type: "ASSOCIATE_SPECIFIC",
            associateId: EMILIANO,
            amount: "400",
          }),
        ],
      }),
    );

    // Iusti paid; Emiliano benefited. Neither field leaks into the other.
    expect(input.payments).toEqual([
      {
        sourceType: "ASSOCIATE_PERSONAL_FUNDS",
        payerAssociateId: IUSTI,
        paymentMethod: "CARD",
        amountMinor: 40_000,
      },
    ]);
    expect(input.allocations).toEqual([
      {
        type: "ASSOCIATE_SPECIFIC",
        associateId: EMILIANO,
        amountMinor: 40_000,
      },
    ]);
  });

  it("omits the fields that do not apply to the chosen variant", () => {
    const input = toCreateExpenseInput(values());

    // The API's discriminated union rejects a book payment naming a payer.
    expect(input.payments[0]).not.toHaveProperty("payerAssociateId");
    expect(input.allocations[0]).not.toHaveProperty("associateId");
    expect(input).not.toHaveProperty("costObjectId");
    expect(input).not.toHaveProperty("supplierId");
  });

  it("sends the selected supplier link separately from document snapshots", () => {
    expect(
      toCreateExpenseInput(values({ supplierId: "supplier-1" })).supplierId,
    ).toBe("supplier-1");
  });

  it("sends documents only when some were entered", () => {
    expect(toCreateExpenseInput(values())).not.toHaveProperty("documents");

    const withDocument = toCreateExpenseInput(
      values({
        documents: [
          {
            type: "RECEIPT",
            documentSeries: "SHOULD-NOT-BE-SENT",
            documentNumber: "",
            issuedAt: "2026-08-14",
            supplierName: "Fuel Station",
            supplierTaxId: "",
            notes: "",
          },
        ],
      }),
    );

    expect(withDocument.documents).toEqual([
      {
        type: "RECEIPT",
        issuedAt: "2026-08-14T00:00:00.000Z",
        supplierName: "Fuel Station",
      },
    ]);
  });

  it("sends a bill series separately from its number", () => {
    const input = toCreateExpenseInput(
      values({
        documents: [
          {
            type: "INVOICE",
            documentSeries: "VL",
            documentNumber: "639013079",
            issuedAt: "2026-08-19",
            supplierName: "REGISTRUL AUTO ROMAN R.A.",
            supplierTaxId: "RO1590236",
            notes: "",
          },
        ],
      }),
    );

    expect(input.documents?.[0]).toMatchObject({
      type: "INVOICE",
      documentSeries: "VL",
      documentNumber: "639013079",
    });
  });
});

describe("findMatchingSupplier", () => {
  const suppliers: v1.finance.Supplier[] = [
    {
      id: "supplier-rotakt",
      name: "ROTAKT S.R.L.",
      taxIdentifier: "RO6334441",
      isVatPayer: true,
      isActive: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "supplier-archived",
      name: "Archived SRL",
      taxIdentifier: "RO100",
      isVatPayer: true,
      isActive: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ];

  it("matches a stored supplier by CIF before considering its displayed name", () => {
    expect(
      findMatchingSupplier(suppliers, "OCR name differs", "C.F. RO 6334441")
        ?.id,
    ).toBe("supplier-rotakt");
  });

  it("matches by normalized name only when the receipt has no CIF", () => {
    expect(findMatchingSupplier(suppliers, "Rotakt srl", null)?.id).toBe(
      "supplier-rotakt",
    );
  });

  it("does not auto-select an archived supplier", () => {
    expect(
      findMatchingSupplier(suppliers, "Archived SRL", null),
    ).toBeUndefined();
  });
});

describe("allocationDefaultsForCostObject", () => {
  const costObject = {
    id: "cost-object-1",
    bookId: BOOK_ID,
    code: "VEHICLE_IUSTI_PERSONAL",
    name: "Iusti Personal Car",
    type: "VEHICLE" as const,
    ownershipType: "ASSOCIATE" as const,
    ownerAssociateId: IUSTI,
    externalEntityType: null,
    externalEntityId: null,
    defaultAllocationType: "ASSOCIATE_SPECIFIC" as const,
    defaultBeneficiaryAssociateId: IUSTI,
    isActive: true,
  };

  it("prefills the beneficiary an associate-owned object implies", () => {
    expect(allocationDefaultsForCostObject(costObject, "200")).toEqual([
      { type: "ASSOCIATE_SPECIFIC", associateId: IUSTI, amount: "200" },
    ]);
  });

  it("prefills a common benefit for a shared object", () => {
    expect(
      allocationDefaultsForCostObject(
        {
          ...costObject,
          ownershipType: "COMPANY",
          defaultAllocationType: "COMMON",
          defaultBeneficiaryAssociateId: null,
        },
        "200",
      ),
    ).toEqual([{ type: "COMMON", associateId: "", amount: "200" }]);
  });

  it("leaves the form alone when the object carries no default", () => {
    expect(
      allocationDefaultsForCostObject(
        { ...costObject, defaultAllocationType: null },
        "200",
      ),
    ).toBeUndefined();
    expect(allocationDefaultsForCostObject(undefined, "200")).toBeUndefined();
  });
});

describe("expenseFormDefaultsFromExtraction", () => {
  it("prefills the company book, card payment, common allocation, and document", () => {
    const companyBook: v1.finance.FinanceBook = {
      id: BOOK_ID,
      name: "Company",
      names: { ro: "Company" },
      type: "COMPANY",
      functionalCurrency: "RON",
      members: [],
    };
    const poolBook: v1.finance.FinanceBook = {
      id: "book-pool",
      name: "Pool",
      names: { ro: "Pool" },
      type: "ASSOCIATE_POOL",
      functionalCurrency: "RON",
      members: [],
    };
    const extraction = v1.finance.normalizedExpenseExtractionSchema.parse({
      amountMinor: candidate(12_345),
      occurredAt: candidate("2026-08-22"),
      currency: candidate("RON"),
      supplierName: candidate("Example Parts SRL"),
      supplierTaxIdentifier: candidate("RO87654321"),
      customerName: candidate("Example Company SRL"),
      customerTaxIdentifier: candidate("RO12345678"),
      documentSeries: candidate("VL"),
      documentNumber: candidate("R-42"),
      companyMatch: {
        status: "MATCHED",
        matchedBy: "TAX_IDENTIFIER",
        evidence: [],
      },
      suggestedBookType: "COMPANY",
      suggestedDocumentType: "INVOICE",
      suggestedPaymentMethod: "CARD",
      suggestedAllocationType: "COMMON",
      suggestedCategoryCode: "PARTS",
      suggestionEvidence: {
        bookType: [],
        documentType: [],
        paymentMethod: [],
        allocationType: [],
        categoryCode: [],
      },
      explanations: [],
    });

    const defaults = expenseFormDefaultsFromExtraction({
      extraction,
      books: [companyBook, poolBook],
      accounts: [
        {
          id: "account-bank",
          bookId: BOOK_ID,
          code: "BANK",
          name: "Company bank",
          category: "ASSET",
          role: "BANK",
          associateId: null,
          associate: null,
          isDefault: true,
          isActive: true,
          isSystem: true,
        },
      ],
      categories: [
        {
          id: "category-parts",
          bookId: BOOK_ID,
          code: "PARTS",
          name: "Parts",
          defaultTreatment: "OPERATING_EXPENSE",
          isActive: true,
        },
      ],
      suppliers: [
        {
          id: "supplier-parts",
          name: "Example Parts SRL",
          taxIdentifier: "87654321",
          isVatPayer: false,
          isActive: true,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      currentUserId: "user-current",
      fallbackBook: companyBook,
      today: "2026-08-23",
    });

    expect(defaults).toMatchObject({
      bookId: BOOK_ID,
      supplierId: "supplier-parts",
      occurredAt: "2026-08-22",
      amount: "123.45",
      categoryId: "category-parts",
      payments: [
        {
          sourceAccountId: "account-bank",
          paymentMethod: "CARD",
          amount: "123.45",
        },
      ],
      allocations: [{ type: "COMMON", amount: "123.45" }],
      documents: [
        {
          type: "INVOICE",
          documentSeries: "VL",
          documentNumber: "R-42",
          issuedAt: "2026-08-22",
          supplierName: "Example Parts SRL",
          supplierTaxId: "RO87654321",
        },
      ],
    });
  });

  it("prefills an unmatched receipt as a shared associate-pool expense paid by the current user", () => {
    const companyBook: v1.finance.FinanceBook = {
      id: BOOK_ID,
      name: "Company",
      names: { ro: "Company" },
      type: "COMPANY",
      functionalCurrency: "RON",
      members: [],
    };
    const poolBook: v1.finance.FinanceBook = {
      id: "book-pool",
      name: "Associate pool",
      names: { ro: "Associate pool" },
      type: "ASSOCIATE_POOL",
      functionalCurrency: "RON",
      members: [],
    };
    const extraction = v1.finance.normalizedExpenseExtractionSchema.parse({
      amountMinor: candidate(2_500),
      occurredAt: candidate("2026-08-19"),
      currency: candidate("RON"),
      supplierName: candidate("ROTAKT SRL"),
      supplierTaxIdentifier: candidate("RO6334441"),
      customerName: candidate(null),
      customerTaxIdentifier: candidate(null),
      documentNumber: candidate("706210"),
      companyMatch: {
        status: "UNKNOWN",
        matchedBy: null,
        evidence: [],
      },
      suggestedBookType: "ASSOCIATE_POOL",
      suggestedPaymentMethod: "CASH",
      suggestedAllocationType: "COMMON",
      suggestedCategoryCode: "POOL_SHARED_COST",
      suggestionEvidence: {
        bookType: [],
        paymentMethod: [],
        allocationType: [],
        categoryCode: [],
      },
      explanations: [],
    });

    const defaults = expenseFormDefaultsFromExtraction({
      extraction,
      books: [companyBook, poolBook],
      accounts: [],
      categories: [
        {
          id: "category-pool-shared",
          bookId: poolBook.id,
          code: "POOL_SHARED_COST",
          name: "Shared pool cost",
          defaultTreatment: "ASSOCIATE_POOL_EXPENSE",
          isActive: true,
        },
      ],
      suppliers: [],
      currentUserId: "user-current",
      fallbackBook: companyBook,
      today: "2026-08-23",
    });

    expect(defaults).toMatchObject({
      bookId: poolBook.id,
      occurredAt: "2026-08-19",
      amount: "25.00",
      treatment: "ASSOCIATE_POOL_EXPENSE",
      categoryId: "category-pool-shared",
      payments: [
        {
          sourceType: "ASSOCIATE_PERSONAL_FUNDS",
          sourceAccountId: "",
          payerAssociateId: "user-current",
          paymentMethod: "CASH",
          amount: "25.00",
        },
      ],
      allocations: [{ type: "COMMON", amount: "25.00" }],
    });
  });
});

function candidate<T>(value: T) {
  return { value, confidence: 99, evidence: [] };
}

describe("money helpers", () => {
  it("treats an unparseable line as zero rather than throwing", () => {
    expect(safeMinor("nope")).toBeUndefined();
    expect(sumLines([{ amount: "10" }, { amount: "nope" }])).toBe(1_000);
  });

  it("turns a calendar date into midnight UTC", () => {
    expect(dateToIsoTimestamp("2026-08-14")).toBe("2026-08-14T00:00:00.000Z");
  });
});
