import { FinanceValidationError } from "./finance.errors";
import { assertTreatmentAllowedForBook } from "./finance-invariants";

describe("finance book treatment invariants", () => {
  it.each([
    "OPERATING_EXPENSE",
    "NON_OPERATIONAL_COMPANY_EXPENSE",
    "CAPITAL_ASSET",
  ] as const)("allows %s in the company book", (treatment) => {
    expect(() =>
      assertTreatmentAllowedForBook(treatment, "COMPANY"),
    ).not.toThrow();
  });

  it("allows pool costs in the associate-pool book", () => {
    expect(() =>
      assertTreatmentAllowedForBook("ASSOCIATE_POOL_EXPENSE", "ASSOCIATE_POOL"),
    ).not.toThrow();
  });

  it("rejects a pool cost in the company book", () => {
    expect(() =>
      assertTreatmentAllowedForBook("ASSOCIATE_POOL_EXPENSE", "COMPANY"),
    ).toThrow(FinanceValidationError);
  });

  it("rejects company treatments in the associate-pool book", () => {
    expect(() =>
      assertTreatmentAllowedForBook("OPERATING_EXPENSE", "ASSOCIATE_POOL"),
    ).toThrow(FinanceValidationError);
  });
});
