/**
 * The scenarios in docs/finance/financial-system-architecture.md §11, as
 * executable tests. Each one checks the journal *and* the summary, because
 * the two answer different questions and it is possible to get one right
 * while the other is wrong.
 */
import { FinanceValidationError } from "../finance.errors";
import type { ExpenseCommand } from "../finance.types";
import {
  ACCOUNTS,
  BOOK_ID,
  EMILIANO,
  FakeLedgerAccountResolver,
  IUSTI,
  amountFor,
} from "../testing/fake-ledger";
import { ExpensePostingPolicy } from "./expense-posting.policy";

function policy(): ExpensePostingPolicy {
  return new ExpensePostingPolicy(new FakeLedgerAccountResolver());
}

function expense(overrides: Partial<ExpenseCommand> = {}): ExpenseCommand {
  return {
    bookId: BOOK_ID,
    amountMinor: 30_000,
    treatment: "OPERATING_EXPENSE",
    payments: [
      {
        sourceType: "BOOK_ACCOUNT",
        sourceAccountId: ACCOUNTS.bank.id,
        paymentMethod: "BANK_TRANSFER",
        amountMinor: 30_000,
      },
    ],
    allocations: [{ type: "COMMON", amountMinor: 30_000 }],
    ...overrides,
  };
}

function totalOf(postings: ReadonlyArray<{ signedAmountMinor: number }>) {
  return postings.reduce((sum, line) => sum + line.signedAmountMinor, 0);
}

describe("ExpensePostingPolicy", () => {
  describe("Case A — company bank pays a common expense", () => {
    it("debits the expense account and credits the bank", async () => {
      const plan = await policy().build(expense());

      expect(plan.postings).toHaveLength(2);
      expect(amountFor(plan.postings, ACCOUNTS.operatingExpense.id)).toBe(
        30_000,
      );
      expect(amountFor(plan.postings, ACCOUNTS.bank.id)).toBe(-30_000);
      expect(totalOf(plan.postings)).toBe(0);
    });

    it("reports company money spent and nobody owed", async () => {
      const { summary } = await policy().build(expense());

      expect(summary.companyExpenseMinor).toBe(30_000);
      expect(summary.companyCashImpactMinor).toBe(-30_000);
      expect(summary.associatePayables).toEqual([]);
      expect(summary.specificEconomicBenefits).toEqual([]);
      expect(summary.commonEconomicBenefitMinor).toBe(30_000);
    });
  });

  describe("Case B — Iusti pays from personal funds and Iusti benefits", () => {
    const command = expense({
      amountMinor: 20_000,
      treatment: "NON_OPERATIONAL_COMPANY_EXPENSE",
      payments: [
        {
          sourceType: "ASSOCIATE_PERSONAL_FUNDS",
          payerAssociateId: IUSTI,
          paymentMethod: "CASH",
          amountMinor: 20_000,
        },
      ],
      allocations: [
        { type: "ASSOCIATE_SPECIFIC", associateId: IUSTI, amountMinor: 20_000 },
      ],
    });

    it("credits a payable to Iusti rather than any cash account", async () => {
      const plan = await policy().build(command);

      expect(amountFor(plan.postings, ACCOUNTS.nonOperationalExpense.id)).toBe(
        20_000,
      );
      expect(amountFor(plan.postings, ACCOUNTS.payableIusti.id)).toBe(-20_000);
      expect(totalOf(plan.postings)).toBe(0);
    });

    it("leaves company cash untouched — no company money moved", async () => {
      const { summary } = await policy().build(command);

      expect(summary.companyCashImpactMinor).toBe(0);
      expect(summary.associatePayables).toEqual([
        { associateId: IUSTI, amountMinor: 20_000 },
      ]);
      expect(summary.specificEconomicBenefits).toEqual([
        { associateId: IUSTI, amountMinor: 20_000 },
      ]);
    });
  });

  describe("Case C — Iusti pays from personal funds and Emiliano benefits", () => {
    const command = expense({
      amountMinor: 40_000,
      treatment: "NON_OPERATIONAL_COMPANY_EXPENSE",
      payments: [
        {
          sourceType: "ASSOCIATE_PERSONAL_FUNDS",
          payerAssociateId: IUSTI,
          paymentMethod: "CARD",
          amountMinor: 40_000,
        },
      ],
      allocations: [
        {
          type: "ASSOCIATE_SPECIFIC",
          associateId: EMILIANO,
          amountMinor: 40_000,
        },
      ],
    });

    it("owes Iusti the full amount, not the half he will settle for", async () => {
      const { summary } = await policy().build(command);

      // The reimbursement and the private settlement are separate debts.
      // Netting them here would silently destroy 200 of what Iusti is owed.
      expect(summary.associatePayables).toEqual([
        { associateId: IUSTI, amountMinor: 40_000 },
      ]);
      expect(summary.specificEconomicBenefits).toEqual([
        { associateId: EMILIANO, amountMinor: 40_000 },
      ]);
    });

    it("does not let the beneficiary leak into the payment side", async () => {
      const plan = await policy().build(command);

      expect(amountFor(plan.postings, ACCOUNTS.payableEmiliano.id)).toBe(
        undefined,
      );
      expect(amountFor(plan.postings, ACCOUNTS.payableIusti.id)).toBe(-40_000);
    });
  });

  describe("Case D — Iusti pays a common expense", () => {
    it("owes Iusti the full amount with no specific benefit", async () => {
      const { summary } = await policy().build(
        expense({
          payments: [
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: IUSTI,
              paymentMethod: "CASH",
              amountMinor: 30_000,
            },
          ],
        }),
      );

      expect(summary.associatePayables).toEqual([
        { associateId: IUSTI, amountMinor: 30_000 },
      ]);
      expect(summary.specificEconomicBenefits).toEqual([]);
      expect(summary.commonEconomicBenefitMinor).toBe(30_000);
    });
  });

  describe("Case E — company pays an Emiliano-specific expense", () => {
    it("creates a specific benefit but no payable", async () => {
      const { summary } = await policy().build(
        expense({
          amountMinor: 40_000,
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: ACCOUNTS.bank.id,
              paymentMethod: "CARD",
              amountMinor: 40_000,
            },
          ],
          allocations: [
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: EMILIANO,
              amountMinor: 40_000,
            },
          ],
        }),
      );

      // Company funds were used, so the company owes nobody.
      expect(summary.associatePayables).toEqual([]);
      expect(summary.companyCashImpactMinor).toBe(-40_000);
      expect(summary.specificEconomicBenefits).toEqual([
        { associateId: EMILIANO, amountMinor: 40_000 },
      ]);
    });
  });

  describe("mixed payments", () => {
    it("splits the credit side across every source", async () => {
      const plan = await policy().build(
        expense({
          amountMinor: 100_000,
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: ACCOUNTS.bank.id,
              paymentMethod: "BANK_TRANSFER",
              amountMinor: 50_000,
            },
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: EMILIANO,
              paymentMethod: "CARD",
              amountMinor: 30_000,
            },
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: IUSTI,
              paymentMethod: "CASH",
              amountMinor: 20_000,
            },
          ],
          allocations: [{ type: "COMMON", amountMinor: 100_000 }],
        }),
      );

      expect(plan.postings).toHaveLength(4);
      expect(amountFor(plan.postings, ACCOUNTS.operatingExpense.id)).toBe(
        100_000,
      );
      expect(amountFor(plan.postings, ACCOUNTS.bank.id)).toBe(-50_000);
      expect(amountFor(plan.postings, ACCOUNTS.payableEmiliano.id)).toBe(
        -30_000,
      );
      expect(amountFor(plan.postings, ACCOUNTS.payableIusti.id)).toBe(-20_000);
      expect(totalOf(plan.postings)).toBe(0);
    });

    it("combines two payments by the same associate into one payable total", async () => {
      const { summary } = await policy().build(
        expense({
          amountMinor: 50_000,
          payments: [
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: IUSTI,
              paymentMethod: "CASH",
              amountMinor: 20_000,
            },
            {
              sourceType: "ASSOCIATE_PERSONAL_FUNDS",
              payerAssociateId: IUSTI,
              paymentMethod: "CARD",
              amountMinor: 30_000,
            },
          ],
          allocations: [{ type: "COMMON", amountMinor: 50_000 }],
        }),
      );

      expect(summary.associatePayables).toEqual([
        { associateId: IUSTI, amountMinor: 50_000 },
      ]);
    });
  });

  describe("mixed allocation", () => {
    it("reports common and specific benefit separately", async () => {
      const { summary } = await policy().build(
        expense({
          amountMinor: 100_000,
          payments: [
            {
              sourceType: "BOOK_ACCOUNT",
              sourceAccountId: ACCOUNTS.bank.id,
              paymentMethod: "CARD",
              amountMinor: 100_000,
            },
          ],
          allocations: [
            { type: "COMMON", amountMinor: 70_000 },
            {
              type: "ASSOCIATE_SPECIFIC",
              associateId: EMILIANO,
              amountMinor: 30_000,
            },
          ],
        }),
      );

      expect(summary.commonEconomicBenefitMinor).toBe(70_000);
      expect(summary.specificEconomicBenefits).toEqual([
        { associateId: EMILIANO, amountMinor: 30_000 },
      ]);
    });
  });

  describe("treatments", () => {
    it("capitalizes an asset instead of expensing it", async () => {
      const { postings, summary } = await policy().build(
        expense({ treatment: "CAPITAL_ASSET" }),
      );

      expect(amountFor(postings, ACCOUNTS.fixedAsset.id)).toBe(30_000);
      expect(summary.companyAssetIncreaseMinor).toBe(30_000);
      // The money became something the company owns, so profit is unaffected.
      expect(summary.companyExpenseMinor).toBe(0);
    });

    it("routes each treatment to its own account", async () => {
      const operating = await policy().build(expense());
      const nonOperational = await policy().build(
        expense({ treatment: "NON_OPERATIONAL_COMPANY_EXPENSE" }),
      );

      expect(operating.postings[0].accountId).toBe(
        ACCOUNTS.operatingExpense.id,
      );
      expect(nonOperational.postings[0].accountId).toBe(
        ACCOUNTS.nonOperationalExpense.id,
      );
    });
  });

  describe("rejections", () => {
    it("refuses payments that do not add up to the expense", async () => {
      await expect(
        policy().build(expense({ amountMinor: 40_000 })),
      ).rejects.toThrow(FinanceValidationError);
    });

    it("refuses allocations that do not add up to the expense", async () => {
      await expect(
        policy().build(
          expense({ allocations: [{ type: "COMMON", amountMinor: 10_000 }] }),
        ),
      ).rejects.toThrow(FinanceValidationError);
    });

    it("refuses a zero or negative amount", async () => {
      await expect(
        policy().build(
          expense({
            amountMinor: 0,
            payments: [
              {
                sourceType: "BOOK_ACCOUNT",
                sourceAccountId: ACCOUNTS.bank.id,
                paymentMethod: "CARD",
                amountMinor: 0,
              },
            ],
            allocations: [{ type: "COMMON", amountMinor: 0 }],
          }),
        ),
      ).rejects.toThrow(FinanceValidationError);
    });

    it("refuses to pay an expense out of a revenue account", async () => {
      await expect(
        policy().build(
          expense({
            payments: [
              {
                sourceType: "BOOK_ACCOUNT",
                sourceAccountId: ACCOUNTS.rentalRevenue.id,
                paymentMethod: "OTHER",
                amountMinor: 30_000,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/cannot be used to pay an expense/);
    });

    it("refuses to spend another book's money", async () => {
      await expect(
        policy().build(
          expense({
            payments: [
              {
                sourceType: "BOOK_ACCOUNT",
                sourceAccountId: ACCOUNTS.poolCashEmiliano.id,
                paymentMethod: "CASH",
                amountMinor: 30_000,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/different finance book/);
    });

    it("refuses two allocation lines for the same associate", async () => {
      await expect(
        policy().build(
          expense({
            allocations: [
              {
                type: "ASSOCIATE_SPECIFIC",
                associateId: IUSTI,
                amountMinor: 10_000,
              },
              {
                type: "ASSOCIATE_SPECIFIC",
                associateId: IUSTI,
                amountMinor: 20_000,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/only once/);
    });
  });

  it("pays from company cash an associate is holding", async () => {
    const plan = await policy().build(
      expense({
        payments: [
          {
            sourceType: "BOOK_ACCOUNT",
            sourceAccountId: ACCOUNTS.custodyEmiliano.id,
            paymentMethod: "CASH",
            amountMinor: 30_000,
          },
        ],
      }),
    );

    // Cash Emiliano holds for the company is still company money: spending
    // it reduces company cash and creates no debt to him.
    expect(amountFor(plan.postings, ACCOUNTS.custodyEmiliano.id)).toBe(-30_000);
    expect(plan.summary.companyCashImpactMinor).toBe(-30_000);
    expect(plan.summary.associatePayables).toEqual([]);
  });
});
