import type { v1 } from "@repo/api-shared";
import { describe, expect, it } from "vitest";

import { claimSettlementHref } from "../_lib/links";

const claim = {
  debtorUserId: "debtor/1",
  creditorUserId: "creditor 2",
  debtor: {
    id: "debtor/1",
    email: "debtor@example.com",
    firstName: "Deb",
    lastName: "Tor",
  },
  creditor: {
    id: "creditor 2",
    email: "creditor@example.com",
    firstName: "Cred",
    lastName: "Itor",
  },
  currency: "RON",
  amount: "123.45",
} satisfies v1.finance.OutstandingPersonalClaim;

describe("finance links", () => {
  it("prefills the transaction workflow needed to settle a claim", () => {
    const href = claimSettlementHref(claim, "en");
    const url = new URL(href, "https://example.test");

    expect(url.pathname).toBe("/en/finance/transactions/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: "PERSONAL_FUNDS_SPLIT",
      debtorUserId: "debtor/1",
      creditorUserId: "creditor 2",
      amount: "123.45",
      currency: "RON",
    });
  });
});
