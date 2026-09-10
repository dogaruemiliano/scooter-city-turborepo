import { FinanceValidationError } from "../finance.errors";
import { CompanyBenefitSettlementCalculator } from "./company-benefit-settlement.calculator";
import { SettlementTransferMatcher } from "./settlement-transfer.matcher";

const EMILIANO = "user-emiliano";
const IUSTI = "user-iusti";

const HALF_AND_HALF = [
  { associateId: EMILIANO, shareBasisPoints: 5_000 },
  { associateId: IUSTI, shareBasisPoints: 5_000 },
];

function calculator(): CompanyBenefitSettlementCalculator {
  return new CompanyBenefitSettlementCalculator(
    new SettlementTransferMatcher(),
  );
}

function lineFor(
  result: ReturnType<CompanyBenefitSettlementCalculator["calculate"]>,
  associateId: string,
) {
  return result.lines.find((line) => line.associateId === associateId);
}

describe("CompanyBenefitSettlementCalculator", () => {
  it("splits one associate's benefit so the other is made whole", () => {
    const result = calculator().calculate(HALF_AND_HALF, [
      { operationId: "op-1", associateId: EMILIANO, amountMinor: 40_000 },
    ]);

    expect(result.totalAmountMinor).toBe(40_000);
    expect(lineFor(result, EMILIANO)).toMatchObject({
      actualAmountMinor: 40_000,
      expectedAmountMinor: 20_000,
      adjustmentMinor: -20_000,
    });
    expect(lineFor(result, IUSTI)).toMatchObject({
      actualAmountMinor: 0,
      expectedAmountMinor: 20_000,
      adjustmentMinor: 20_000,
    });
    expect(result.transfers).toEqual([
      {
        fromAssociateId: EMILIANO,
        toAssociateId: IUSTI,
        amountMinor: 20_000,
      },
    ]);
  });

  it("settles nothing when benefits already match the shares", () => {
    const result = calculator().calculate(HALF_AND_HALF, [
      { operationId: "op-1", associateId: EMILIANO, amountMinor: 10_000 },
      { operationId: "op-2", associateId: IUSTI, amountMinor: 10_000 },
    ]);

    expect(result.transfers).toEqual([]);
    expect(result.lines.every((line) => line.adjustmentMinor === 0)).toBe(true);
  });

  it("nets several benefits per associate before settling", () => {
    const result = calculator().calculate(HALF_AND_HALF, [
      { operationId: "op-1", associateId: EMILIANO, amountMinor: 30_000 },
      { operationId: "op-2", associateId: EMILIANO, amountMinor: 10_000 },
      { operationId: "op-3", associateId: IUSTI, amountMinor: 20_000 },
    ]);

    expect(result.totalAmountMinor).toBe(60_000);
    expect(lineFor(result, EMILIANO)?.actualAmountMinor).toBe(40_000);
    expect(lineFor(result, IUSTI)?.actualAmountMinor).toBe(20_000);
    expect(result.transfers).toEqual([
      {
        fromAssociateId: EMILIANO,
        toAssociateId: IUSTI,
        amountMinor: 10_000,
      },
    ]);
  });

  it("returns a zeroed settlement for a period with no specific benefit", () => {
    const result = calculator().calculate(HALF_AND_HALF, []);

    expect(result.totalAmountMinor).toBe(0);
    expect(result.transfers).toEqual([]);
    expect(result.operationIds).toEqual([]);
    expect(result.lines).toHaveLength(2);
  });

  it("lists each contributing operation once", () => {
    const result = calculator().calculate(HALF_AND_HALF, [
      { operationId: "op-1", associateId: EMILIANO, amountMinor: 100 },
      { operationId: "op-1", associateId: IUSTI, amountMinor: 100 },
      { operationId: "op-2", associateId: IUSTI, amountMinor: 100 },
    ]);

    expect(result.operationIds).toEqual(["op-1", "op-2"]);
  });

  it("always produces adjustments that cancel out", () => {
    const result = calculator().calculate(
      [
        { associateId: "a", shareBasisPoints: 3_334 },
        { associateId: "b", shareBasisPoints: 3_333 },
        { associateId: "c", shareBasisPoints: 3_333 },
      ],
      [{ operationId: "op-1", associateId: "a", amountMinor: 100 }],
    );

    expect(
      result.lines.reduce((sum, line) => sum + line.adjustmentMinor, 0),
    ).toBe(0);
  });

  it("honours unequal ownership shares", () => {
    const result = calculator().calculate(
      [
        { associateId: EMILIANO, shareBasisPoints: 7_000 },
        { associateId: IUSTI, shareBasisPoints: 3_000 },
      ],
      [{ operationId: "op-1", associateId: IUSTI, amountMinor: 10_000 }],
    );

    // Iusti is entitled to 30% of the benefit pot, so he must hand back 70%.
    expect(lineFor(result, IUSTI)).toMatchObject({
      expectedAmountMinor: 3_000,
      adjustmentMinor: -7_000,
    });
    expect(result.transfers).toEqual([
      { fromAssociateId: IUSTI, toAssociateId: EMILIANO, amountMinor: 7_000 },
    ]);
  });

  it("refuses shares that do not total a whole book", () => {
    expect(() =>
      calculator().calculate(
        [{ associateId: EMILIANO, shareBasisPoints: 5_000 }],
        [],
      ),
    ).toThrow(FinanceValidationError);
  });

  it("refuses a benefit allocated to a non-owner", () => {
    expect(() =>
      calculator().calculate(HALF_AND_HALF, [
        { operationId: "op-1", associateId: "someone-else", amountMinor: 100 },
      ]),
    ).toThrow(/holds no ownership share/);
  });
});
