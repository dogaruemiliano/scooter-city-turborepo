import type { v1 } from "@repo/api-shared";

import type { OperationRecord } from "../../infrastructure/prisma-finance.repository";
import {
  fingerprintExpenseInput,
  fingerprintStoredExpense,
} from "./expense-command";

const input: v1.finance.CreateExpenseInput = {
  bookId: "company-book",
  supplierId: "supplier-1",
  occurredAt: "2026-08-23T10:00:00.000Z",
  amountMinor: 2_500,
  treatment: "OPERATING_EXPENSE",
  categoryId: "parts-category",
  payments: [
    {
      sourceType: "BOOK_ACCOUNT",
      sourceAccountId: "bank-account",
      paymentMethod: "CARD",
      amountMinor: 2_500,
    },
  ],
  allocations: [{ type: "COMMON", amountMinor: 2_500 }],
};

describe("expense supplier idempotency fingerprint", () => {
  it("treats a different supplier as a different expense command", () => {
    expect(
      fingerprintExpenseInput({ ...input, supplierId: "supplier-2" }),
    ).not.toBe(fingerprintExpenseInput(input));
  });

  it("keeps a direct receipt upload token out of the expense fingerprint", () => {
    expect(
      fingerprintExpenseInput({
        ...input,
        receiptUploadToken: "signed-upload-token",
      }),
    ).toBe(fingerprintExpenseInput(input));
  });

  it("builds the same supplier fingerprint from the persisted expense", () => {
    const row = {
      bookId: input.bookId,
      occurredAt: new Date(input.occurredAt),
      expense: {
        amountMinor: input.amountMinor,
        treatment: input.treatment,
        categoryId: input.categoryId,
        costObjectId: null,
        supplierId: input.supplierId,
        payments: [
          {
            sourceType: "BOOK_ACCOUNT",
            sourceAccountId: "bank-account",
            payerAssociateId: null,
            paymentMethod: "CARD",
            amountMinor: 2_500,
          },
        ],
      },
      allocations: input.allocations.map((allocation) => ({
        type: allocation.type,
        associateId: null,
        amountMinor: allocation.amountMinor,
      })),
      expenseExtractionDraft: null,
    } as unknown as OperationRecord;

    expect(fingerprintStoredExpense(row)).toBe(fingerprintExpenseInput(input));
  });
});
