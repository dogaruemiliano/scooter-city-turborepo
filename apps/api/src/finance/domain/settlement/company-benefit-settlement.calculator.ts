/**
 * Works out what associates owe each other for benefits the company paid for.
 *
 * The question this answers is narrow: over some period, the company paid for
 * things that benefited one associate specifically. Since both associates own
 * the company, each has effectively funded a share of the other's private
 * benefit. This calculates the balancing payment.
 *
 * What it deliberately ignores:
 *
 * - **Who paid.** Whether the money came from the company bank or from an
 *   associate's own pocket changes what the company owes that associate; it
 *   does not change who benefited. Those are separate obligations and this
 *   calculator only handles the second (finance spec §2.2, §17).
 * - **Common benefits.** Shared costs are already borne in proportion to
 *   ownership, so they never generate a settlement.
 * - **Capital assets.** The money became something the company owns, not a
 *   benefit anyone consumed.
 *
 * Worked example — Emiliano received 400 of specific benefit, Iusti none, at
 * 50/50 ownership. Each is entitled to 200 of the 400 total, so Emiliano is
 * 200 over and Iusti 200 short: Emiliano pays Iusti 200.
 */
import { Injectable } from "@nestjs/common";

import { FinanceValidationError } from "../finance.errors";
import { assertSharesTotalWhole } from "../finance-invariants";
import {
  groupByAssociate,
  splitByBasisPoints,
  sumMinor,
  type BasisPointShare,
} from "../money";
import {
  SettlementTransferMatcher,
  type MatchedTransfer,
} from "./settlement-transfer.matcher";

export interface SpecificBenefit {
  operationId: string;
  associateId: string;
  amountMinor: number;
}

export interface SettlementResultLine {
  associateId: string;
  shareBasisPoints: number;
  actualAmountMinor: number;
  expectedAmountMinor: number;
  /** Positive = must receive. Negative = must pay. */
  adjustmentMinor: number;
}

export interface CompanyBenefitSettlement {
  totalAmountMinor: number;
  lines: SettlementResultLine[];
  transfers: MatchedTransfer[];
  operationIds: string[];
}

@Injectable()
export class CompanyBenefitSettlementCalculator {
  constructor(private readonly matcher: SettlementTransferMatcher) {}

  /**
   * @param shares Active ownership shares; must total 10,000 basis points.
   * @param benefits Specific-benefit allocation lines from posted, unreversed,
   * not-yet-settled expense operations in the period.
   */
  calculate(
    shares: readonly BasisPointShare[],
    benefits: readonly SpecificBenefit[],
  ): CompanyBenefitSettlement {
    assertSharesTotalWhole(shares);

    const totalAmountMinor = sumMinor(
      benefits.map((benefit) => benefit.amountMinor),
    );

    const actualByAssociate = new Map(
      groupByAssociate(
        benefits.map(({ associateId, amountMinor }) => ({
          associateId,
          amountMinor,
        })),
      ).map((entry) => [entry.associateId, entry.amountMinor]),
    );

    // A benefit owed to someone with no ownership share has nobody to settle
    // against — the adjustments could never cancel out. Surface it instead of
    // quietly dropping their amount.
    const shareholders = new Set(shares.map((share) => share.associateId));
    const outsider = [...actualByAssociate.keys()].find(
      (associateId) => !shareholders.has(associateId),
    );

    if (outsider) {
      throw new FinanceValidationError(
        "An expense in this period allocates benefit to someone who holds no ownership share in the book.",
        { associateId: outsider },
      );
    }

    // Split rather than multiply: at 1/3 shares of 100 bani, three roundings
    // would lose a ban and the adjustments would never sum to zero.
    const expectedByAssociate = new Map(
      splitByBasisPoints(totalAmountMinor, shares).map((entry) => [
        entry.associateId,
        entry.amountMinor,
      ]),
    );

    const lines: SettlementResultLine[] = shares.map((share) => {
      const actualAmountMinor = actualByAssociate.get(share.associateId) ?? 0;
      const expectedAmountMinor =
        expectedByAssociate.get(share.associateId) ?? 0;

      return {
        associateId: share.associateId,
        shareBasisPoints: share.shareBasisPoints,
        actualAmountMinor,
        expectedAmountMinor,
        // Received less than entitled to → owed money. Received more → owes.
        adjustmentMinor: expectedAmountMinor - actualAmountMinor,
      };
    });

    return {
      totalAmountMinor,
      lines,
      transfers: this.matcher.match(lines),
      operationIds: [
        ...new Set(benefits.map((benefit) => benefit.operationId)),
      ],
    };
  }
}
