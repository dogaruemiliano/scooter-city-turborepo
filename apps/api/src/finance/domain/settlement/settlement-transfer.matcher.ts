/**
 * Turns a set of settlement adjustments into actual payments to make.
 *
 * The adjustments say who is short and who is over; they do not say who pays
 * whom. With two associates that is trivial. With more, a naive "everyone
 * pays into a pot" scheme produces twice the transfers people need to make.
 *
 * This walks debtors and creditors together, largest first, settling as much
 * as possible with each payment. For n associates it produces at most n-1
 * transfers, which is the minimum possible when every adjustment is non-zero.
 */
import { Injectable } from "@nestjs/common";

import { FinanceValidationError } from "../finance.errors";
import { sumMinor } from "../money";

export interface SettlementAdjustment {
  associateId: string;
  /** Positive = must receive. Negative = must pay. */
  adjustmentMinor: number;
}

export interface MatchedTransfer {
  fromAssociateId: string;
  toAssociateId: string;
  amountMinor: number;
}

@Injectable()
export class SettlementTransferMatcher {
  /**
   * @throws {FinanceValidationError} when adjustments do not cancel out.
   * A non-zero sum means money would be created or destroyed by settling.
   */
  match(adjustments: readonly SettlementAdjustment[]): MatchedTransfer[] {
    const residual = sumMinor(
      adjustments.map((entry) => entry.adjustmentMinor),
    );

    if (residual !== 0) {
      throw new FinanceValidationError(
        `Settlement adjustments must cancel out but leave ${residual} minor units.`,
        { residual },
      );
    }

    // Sorting by amount then id keeps the transfer list stable: the same
    // settlement recalculated later must propose the same payments.
    const debtors = adjustments
      .filter((entry) => entry.adjustmentMinor < 0)
      .map((entry) => ({
        associateId: entry.associateId,
        owed: -entry.adjustmentMinor,
      }))
      .sort(
        (left, right) =>
          right.owed - left.owed ||
          left.associateId.localeCompare(right.associateId),
      );

    const creditors = adjustments
      .filter((entry) => entry.adjustmentMinor > 0)
      .map((entry) => ({
        associateId: entry.associateId,
        due: entry.adjustmentMinor,
      }))
      .sort(
        (left, right) =>
          right.due - left.due ||
          left.associateId.localeCompare(right.associateId),
      );

    const transfers: MatchedTransfer[] = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const amountMinor = Math.min(debtor.owed, creditor.due);

      if (amountMinor > 0) {
        transfers.push({
          fromAssociateId: debtor.associateId,
          toAssociateId: creditor.associateId,
          amountMinor,
        });
      }

      debtor.owed -= amountMinor;
      creditor.due -= amountMinor;

      if (debtor.owed === 0) debtorIndex += 1;
      if (creditor.due === 0) creditorIndex += 1;
    }

    return transfers;
  }
}
