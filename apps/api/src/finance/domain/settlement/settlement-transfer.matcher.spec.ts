import { FinanceValidationError } from "../finance.errors";
import { SettlementTransferMatcher } from "./settlement-transfer.matcher";

describe("SettlementTransferMatcher", () => {
  const matcher = new SettlementTransferMatcher();

  it("moves money from the associate who is over to the one who is short", () => {
    expect(
      matcher.match([
        { associateId: "emiliano", adjustmentMinor: -20_000 },
        { associateId: "iusti", adjustmentMinor: 20_000 },
      ]),
    ).toEqual([
      {
        fromAssociateId: "emiliano",
        toAssociateId: "iusti",
        amountMinor: 20_000,
      },
    ]);
  });

  it("proposes nothing when everyone is already square", () => {
    expect(
      matcher.match([
        { associateId: "emiliano", adjustmentMinor: 0 },
        { associateId: "iusti", adjustmentMinor: 0 },
      ]),
    ).toEqual([]);
  });

  it("settles three associates in two payments, not three", () => {
    const transfers = matcher.match([
      { associateId: "a", adjustmentMinor: -300 },
      { associateId: "b", adjustmentMinor: 100 },
      { associateId: "c", adjustmentMinor: 200 },
    ]);

    expect(transfers).toHaveLength(2);
    expect(transfers).toEqual([
      { fromAssociateId: "a", toAssociateId: "c", amountMinor: 200 },
      { fromAssociateId: "a", toAssociateId: "b", amountMinor: 100 },
    ]);
  });

  it("splits one debtor across several creditors", () => {
    const transfers = matcher.match([
      { associateId: "payer", adjustmentMinor: -500 },
      { associateId: "a", adjustmentMinor: 300 },
      { associateId: "b", adjustmentMinor: 150 },
      { associateId: "c", adjustmentMinor: 50 },
    ]);

    expect(transfers).toHaveLength(3);
    expect(
      transfers.reduce((sum, transfer) => sum + transfer.amountMinor, 0),
    ).toBe(500);
    expect(
      transfers.every((transfer) => transfer.fromAssociateId === "payer"),
    ).toBe(true);
  });

  it("keeps at most n-1 transfers for n associates", () => {
    const transfers = matcher.match([
      { associateId: "a", adjustmentMinor: -400 },
      { associateId: "b", adjustmentMinor: -100 },
      { associateId: "c", adjustmentMinor: 250 },
      { associateId: "d", adjustmentMinor: 250 },
    ]);

    expect(transfers.length).toBeLessThanOrEqual(3);
  });

  it("produces the same plan regardless of input order", () => {
    const adjustments = [
      { associateId: "a", adjustmentMinor: -300 },
      { associateId: "b", adjustmentMinor: 100 },
      { associateId: "c", adjustmentMinor: 200 },
    ];

    expect(matcher.match(adjustments)).toEqual(
      matcher.match([...adjustments].reverse()),
    );
  });

  it("refuses adjustments that do not cancel out", () => {
    // A non-zero sum means settling would create or destroy money.
    expect(() =>
      matcher.match([
        { associateId: "emiliano", adjustmentMinor: -100 },
        { associateId: "iusti", adjustmentMinor: 50 },
      ]),
    ).toThrow(FinanceValidationError);
  });
});
