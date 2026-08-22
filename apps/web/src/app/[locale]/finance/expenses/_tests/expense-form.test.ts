import { describe, expect, it } from "vitest";

import {
  allocationDefaultsForCostObject,
  dateToIsoTimestamp,
  emptyAllocationLine,
  emptyPaymentLine,
  expenseFormDefaults,
  expenseFormSchema,
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
  });

  it("sends documents only when some were entered", () => {
    expect(toCreateExpenseInput(values())).not.toHaveProperty("documents");

    const withDocument = toCreateExpenseInput(
      values({
        documents: [
          {
            type: "RECEIPT",
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

describe("money helpers", () => {
  it("treats an unparseable line as zero rather than throwing", () => {
    expect(safeMinor("nope")).toBeUndefined();
    expect(sumLines([{ amount: "10" }, { amount: "nope" }])).toBe(1_000);
  });

  it("turns a calendar date into midnight UTC", () => {
    expect(dateToIsoTimestamp("2026-08-14")).toBe("2026-08-14T00:00:00.000Z");
  });
});
