import { describe, expect, it } from "vitest";

import {
  fundingFormDefaults,
  fundingFormSchema,
  toFundingInput,
  todayLocalDateOnly,
} from "../_lib/funding-form";

describe("funding form", () => {
  it("defaults to the current associate, company bank, today, and a loan", () => {
    expect(
      fundingFormDefaults({
        associateId: "current-user",
        destinationAccountId: "company-bank",
        today: "2026-08-17",
      }),
    ).toMatchObject({
      associateId: "current-user",
      destinationAccountId: "company-bank",
      occurredAt: "2026-08-17",
      type: "LOAN",
    });
  });

  it("converts major currency units without treating funding as income", () => {
    const values = fundingFormSchema.parse({
      amount: "1 250,50",
      destinationAccountId: "company-bank",
      associateId: "current-user",
      occurredAt: "2026-08-17",
      type: "CAPITAL_CONTRIBUTION",
      reference: "BANK-42",
      notes: "Permanent contribution",
    });

    expect(toFundingInput("company-book", values)).toEqual({
      bookId: "company-book",
      occurredAt: "2026-08-17T00:00:00.000Z",
      amountMinor: 125_050,
      type: "CAPITAL_CONTRIBUTION",
      associateId: "current-user",
      destinationAccountId: "company-bank",
      reference: "BANK-42",
      notes: "Permanent contribution",
    });
  });

  it("uses the local calendar day rather than the UTC day", () => {
    expect(todayLocalDateOnly(new Date("2026-08-17T23:30:00-03:00"))).toBe(
      "2026-08-18",
    );
  });
});
