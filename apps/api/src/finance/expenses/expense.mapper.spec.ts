import { Prisma } from "../../generated/prisma/client";
import { toExpenseReimbursementClaim } from "./expense.mapper";

describe("expense reimbursement mapping", () => {
  it("reports no outstanding debt for a cancelled claim", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");

    expect(
      toExpenseReimbursementClaim({
        id: "claim-1",
        expenseId: "expense-1",
        expensePaymentId: "payment-1",
        legalEntityId: "entity-1",
        claimantUserId: "user-1",
        status: "CANCELLED",
        originalAmount: new Prisma.Decimal(119),
        settledAmount: new Prisma.Decimal(0),
        currency: "RON",
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({
      status: "CANCELLED",
      originalAmount: "119.00",
      settledAmount: "0.00",
      outstandingAmount: "0.00",
    });
  });
});
