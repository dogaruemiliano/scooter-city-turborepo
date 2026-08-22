import { FinanceValidationError } from "./finance.errors";
import {
  assertPositiveAmount,
  groupByAssociate,
  splitByBasisPoints,
  sumMinor,
} from "./money";

const EQUAL_HALVES = [
  { associateId: "emiliano", shareBasisPoints: 5_000 },
  { associateId: "iusti", shareBasisPoints: 5_000 },
];

const EQUAL_THIRDS = [
  { associateId: "a", shareBasisPoints: 3_334 },
  { associateId: "b", shareBasisPoints: 3_333 },
  { associateId: "c", shareBasisPoints: 3_333 },
];

function total(parts: ReadonlyArray<{ amountMinor: number }>): number {
  return sumMinor(parts.map((part) => part.amountMinor));
}

describe("splitByBasisPoints", () => {
  it("splits an even amount evenly", () => {
    expect(splitByBasisPoints(40_000, EQUAL_HALVES)).toEqual([
      { associateId: "emiliano", amountMinor: 20_000 },
      { associateId: "iusti", amountMinor: 20_000 },
    ]);
  });

  it("never loses a minor unit to rounding", () => {
    // 100 / 3 rounds to 33 three times and loses a ban; the largest-remainder
    // method gives the odd unit to somebody instead.
    const parts = splitByBasisPoints(100, EQUAL_THIRDS);

    expect(total(parts)).toBe(100);
    expect(parts.map((part) => part.amountMinor).sort()).toEqual([33, 33, 34]);
  });

  it("keeps the total exact across many awkward amounts", () => {
    for (let amount = 0; amount <= 500; amount += 1) {
      expect(total(splitByBasisPoints(amount, EQUAL_THIRDS))).toBe(amount);
      expect(total(splitByBasisPoints(amount, EQUAL_HALVES))).toBe(amount);
    }
  });

  it("is deterministic — the same input always splits the same way", () => {
    const first = splitByBasisPoints(101, EQUAL_HALVES);
    const second = splitByBasisPoints(101, EQUAL_HALVES);

    expect(first).toEqual(second);
    // The tie on remainder breaks on associate id, not on argument order.
    expect(splitByBasisPoints(101, [...EQUAL_HALVES].reverse())).toEqual(
      [...second].reverse(),
    );
  });

  it("splits zero into zeroes rather than failing", () => {
    expect(splitByBasisPoints(0, EQUAL_HALVES)).toEqual([
      { associateId: "emiliano", amountMinor: 0 },
      { associateId: "iusti", amountMinor: 0 },
    ]);
  });

  it("refuses shares that do not add up to a whole book", () => {
    expect(() =>
      splitByBasisPoints(100, [
        { associateId: "emiliano", shareBasisPoints: 5_000 },
        { associateId: "iusti", shareBasisPoints: 4_000 },
      ]),
    ).toThrow(FinanceValidationError);
  });

  it("refuses to split a negative amount", () => {
    expect(() => splitByBasisPoints(-100, EQUAL_HALVES)).toThrow(
      FinanceValidationError,
    );
  });

  it("refuses to split across nobody", () => {
    expect(() => splitByBasisPoints(100, [])).toThrow(FinanceValidationError);
  });
});

describe("groupByAssociate", () => {
  it("adds up repeated entries and keeps first-seen order", () => {
    expect(
      groupByAssociate([
        { associateId: "iusti", amountMinor: 200 },
        { associateId: "emiliano", amountMinor: 50 },
        { associateId: "iusti", amountMinor: 300 },
      ]),
    ).toEqual([
      { associateId: "iusti", amountMinor: 500 },
      { associateId: "emiliano", amountMinor: 50 },
    ]);
  });

  it("returns nothing for no input", () => {
    expect(groupByAssociate([])).toEqual([]);
  });
});

describe("assertPositiveAmount", () => {
  it.each([0, -1, 1.5, Number.NaN])("rejects %p", (amount) => {
    expect(() => assertPositiveAmount(amount, "Amount")).toThrow(
      FinanceValidationError,
    );
  });

  it("accepts a positive whole number", () => {
    expect(() => assertPositiveAmount(1, "Amount")).not.toThrow();
  });
});
