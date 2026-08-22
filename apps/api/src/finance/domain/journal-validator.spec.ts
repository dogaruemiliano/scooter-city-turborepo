import {
  FinanceValidationError,
  UnbalancedJournalError,
} from "./finance.errors";
import { JournalValidator } from "./journal-validator";
import type { PostingLine } from "./posting-plan";

function line(accountId: string, signedAmountMinor: number): PostingLine {
  return {
    accountId,
    accountCode: accountId.toUpperCase(),
    accountName: accountId,
    accountRole: "BANK",
    accountCategory: "ASSET",
    associateId: null,
    signedAmountMinor,
    description: "test",
  };
}

describe("JournalValidator", () => {
  const validator = new JournalValidator();

  describe("assertBalanced", () => {
    it("accepts an entry whose lines cancel out", () => {
      expect(() =>
        validator.assertBalanced([line("expense", 300), line("bank", -300)]),
      ).not.toThrow();
    });

    it("accepts a multi-line entry that still cancels out", () => {
      expect(() =>
        validator.assertBalanced([
          line("expense", 1_000),
          line("bank", -500),
          line("payable-a", -300),
          line("payable-b", -200),
        ]),
      ).not.toThrow();
    });

    it("rejects an entry that is off by even one minor unit", () => {
      expect(() =>
        validator.assertBalanced([line("expense", 300), line("bank", -299)]),
      ).toThrow(UnbalancedJournalError);
    });

    it("rejects a single-sided entry", () => {
      expect(() => validator.assertBalanced([line("expense", 300)])).toThrow(
        FinanceValidationError,
      );
    });

    it("rejects a line that moves nothing", () => {
      expect(() =>
        validator.assertBalanced([
          line("expense", 300),
          line("bank", -300),
          line("noise", 0),
        ]),
      ).toThrow(/moves nothing/);
    });
  });

  describe("assertExactInverse", () => {
    const original = [
      line("expense", 1_000),
      line("bank", -600),
      line("payable", -400),
    ];

    it("accepts a line-for-line mirror image", () => {
      expect(() =>
        validator.assertExactInverse(original, [
          line("expense", -1_000),
          line("bank", 600),
          line("payable", 400),
        ]),
      ).not.toThrow();
    });

    it("does not care about line order", () => {
      expect(() =>
        validator.assertExactInverse(original, [
          line("payable", 400),
          line("expense", -1_000),
          line("bank", 600),
        ]),
      ).not.toThrow();
    });

    it("rejects a reversal that balances but hits different accounts", () => {
      // Totals cancel, yet the bank and the payable would both end up wrong.
      expect(() =>
        validator.assertExactInverse(original, [
          line("expense", -1_000),
          line("bank", 1_000),
        ]),
      ).toThrow(FinanceValidationError);
    });

    it("rejects a reversal that moves a different amount", () => {
      expect(() =>
        validator.assertExactInverse(original, [
          line("expense", -1_000),
          line("bank", 500),
          line("payable", 500),
        ]),
      ).toThrow(/missing the inverse/);
    });
  });
});
