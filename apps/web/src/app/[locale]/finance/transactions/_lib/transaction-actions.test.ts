import { describe, expect, it } from "vitest";

import { availableTransactionActions } from "./transaction-actions";

describe("availableTransactionActions", () => {
  it("only offers posting for drafts", () => {
    expect(
      availableTransactionActions({ status: "DRAFT", type: "EXPENSE" }),
    ).toEqual({ canPost: true, canReverse: false });
  });

  it("offers reversal for normal posted entries", () => {
    expect(
      availableTransactionActions({ status: "POSTED", type: "EXPENSE" }),
    ).toEqual({ canPost: false, canReverse: true });
  });

  it("does not offer direct reversal for generated claims", () => {
    expect(
      availableTransactionActions({
        status: "POSTED",
        type: "PERSONAL_FUNDS_CLAIM",
      }),
    ).toEqual({ canPost: false, canReverse: false });
  });

  it("offers no mutation for reversed entries", () => {
    expect(
      availableTransactionActions({ status: "REVERSED", type: "INCOME" }),
    ).toEqual({ canPost: false, canReverse: false });
  });
});
