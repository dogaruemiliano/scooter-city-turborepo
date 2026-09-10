import type { AssociateFundingCommand } from "../finance.types";
import {
  ACCOUNTS,
  BOOK_ID,
  EMILIANO,
  FakeLedgerAccountResolver,
  amountFor,
} from "../testing/fake-ledger";
import { AssociateFundingPostingPolicy } from "./associate-funding-posting.policy";

function policy() {
  return new AssociateFundingPostingPolicy(new FakeLedgerAccountResolver());
}

function funding(
  overrides: Partial<AssociateFundingCommand> = {},
): AssociateFundingCommand {
  return {
    bookId: BOOK_ID,
    amountMinor: 50_000,
    type: "LOAN",
    associateId: EMILIANO,
    destinationAccountId: ACCOUNTS.bank.id,
    ...overrides,
  };
}

describe("AssociateFundingPostingPolicy", () => {
  it("records a repayable associate loan without creating income", async () => {
    const plan = await policy().build(funding());

    expect(amountFor(plan.postings, ACCOUNTS.bank.id)).toBe(50_000);
    expect(amountFor(plan.postings, ACCOUNTS.loanPayableEmiliano.id)).toBe(
      -50_000,
    );
    expect(plan.summary.companyCashImpactMinor).toBe(50_000);
    expect(plan.summary.associatePayables).toEqual([
      { associateId: EMILIANO, amountMinor: 50_000 },
    ]);
    expect(plan.summary.companyEquityIncreaseMinor).toBe(0);
  });

  it("records a capital contribution as equity that is not owed back", async () => {
    const plan = await policy().build(
      funding({ type: "CAPITAL_CONTRIBUTION" }),
    );

    expect(amountFor(plan.postings, ACCOUNTS.bank.id)).toBe(50_000);
    expect(amountFor(plan.postings, ACCOUNTS.contributedCapital.id)).toBe(
      -50_000,
    );
    expect(plan.summary.associatePayables).toEqual([]);
    expect(plan.summary.companyEquityIncreaseMinor).toBe(50_000);
  });
});
