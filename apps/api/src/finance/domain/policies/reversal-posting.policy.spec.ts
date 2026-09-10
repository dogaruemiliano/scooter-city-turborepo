import { FinanceStateError } from "../finance.errors";
import type { PostingLine } from "../posting-plan";
import {
  ReversalPostingPolicy,
  type ReversalSource,
} from "./reversal-posting.policy";

function line(
  accountId: string,
  signedAmountMinor: number,
  overrides: Partial<PostingLine> = {},
): PostingLine {
  return {
    accountId,
    accountCode: accountId.toUpperCase(),
    accountName: accountId,
    accountRole: "OPERATING_EXPENSE",
    accountCategory: "EXPENSE",
    associateId: null,
    signedAmountMinor,
    description: "Expense incurred",
    ...overrides,
  };
}

function source(overrides: Partial<ReversalSource> = {}): ReversalSource {
  return {
    operationId: "op-1",
    status: "POSTED",
    postings: [
      line("expense", 30_000),
      line("payable-iusti", -30_000, {
        accountRole: "PAYABLE_TO_ASSOCIATE",
        accountCategory: "LIABILITY",
        associateId: "user-iusti",
        description: "Paid from personal funds",
      }),
    ],
    allocations: [{ type: "COMMON", amountMinor: 30_000 }],
    ...overrides,
  };
}

describe("ReversalPostingPolicy", () => {
  const policy = new ReversalPostingPolicy();

  it("flips the sign of every line, account for account", () => {
    const plan = policy.build(source());

    expect(plan.postings.map((posting) => posting.signedAmountMinor)).toEqual([
      -30_000, 30_000,
    ]);
    expect(plan.postings.map((posting) => posting.accountId)).toEqual([
      "expense",
      "payable-iusti",
    ]);
  });

  it("still balances", () => {
    const plan = policy.build(source());

    expect(
      plan.postings.reduce((sum, line) => sum + line.signedAmountMinor, 0),
    ).toBe(0);
  });

  it("undoes the debt the original created", () => {
    const plan = policy.build(source());

    // The original owed Iusti 30,000; the reversal takes that back.
    expect(plan.summary.associatePayables).toEqual([
      { associateId: "user-iusti", amountMinor: -30_000 },
    ]);
    expect(plan.summary.companyExpenseMinor).toBe(-30_000);
  });

  it("withdraws the benefit along with the money", () => {
    const plan = policy.build(
      source({
        allocations: [
          {
            type: "ASSOCIATE_SPECIFIC",
            associateId: "user-emiliano",
            amountMinor: 30_000,
          },
        ],
      }),
    );

    expect(plan.summary.specificEconomicBenefits).toEqual([
      { associateId: "user-emiliano", amountMinor: -30_000 },
    ]);
  });

  it("labels each line as a reversal so the journal reads plainly", () => {
    const plan = policy.build(source());

    expect(plan.postings[0].description).toBe("Reversal of: Expense incurred");
  });

  it("refuses to reverse a draft, which never touched the books", () => {
    expect(() => policy.build(source({ status: "DRAFT" }))).toThrow(
      FinanceStateError,
    );
  });

  it("refuses to reverse the same operation twice", () => {
    expect(() => policy.build(source({ status: "REVERSED" }))).toThrow(
      /already been reversed/,
    );
  });

  it("refuses an operation with no journal entry", () => {
    expect(() => policy.build(source({ postings: [] }))).toThrow(
      FinanceStateError,
    );
  });
});
