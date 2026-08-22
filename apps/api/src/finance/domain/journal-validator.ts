/**
 * The last gate before anything is written to the ledger.
 *
 * Double-entry has exactly one non-negotiable rule: the lines of an entry sum
 * to zero. Everything else in this module can be argued about; this cannot.
 * The check runs before the Prisma transaction opens, so a policy bug fails
 * fast and loudly instead of persisting a lopsided entry.
 */
import { Injectable } from "@nestjs/common";

import {
  FinanceValidationError,
  UnbalancedJournalError,
} from "./finance.errors";
import type { PostingLine } from "./posting-plan";
import { sumMinor } from "./money";

@Injectable()
export class JournalValidator {
  /**
   * @throws {UnbalancedJournalError} when debits and credits disagree.
   * @throws {FinanceValidationError} when the entry is structurally unusable.
   */
  assertBalanced(postings: readonly PostingLine[]): void {
    if (postings.length < 2) {
      throw new FinanceValidationError(
        "A journal entry needs at least two lines: something given and something received.",
        { lineCount: postings.length },
      );
    }

    const zeroLine = postings.find((line) => line.signedAmountMinor === 0);
    if (zeroLine) {
      throw new FinanceValidationError(
        `Journal line for ${zeroLine.accountCode} moves nothing.`,
        { accountId: zeroLine.accountId },
      );
    }

    const imbalance = sumMinor(postings.map((line) => line.signedAmountMinor));

    if (imbalance !== 0) {
      throw new UnbalancedJournalError(imbalance, postings.length);
    }
  }

  /**
   * Confirms a reversal exactly undoes its original — same accounts, same
   * magnitudes, opposite signs. A reversal that merely balances would still
   * satisfy `assertBalanced` while quietly changing what the books say.
   */
  assertExactInverse(
    original: readonly PostingLine[],
    reversal: readonly PostingLine[],
  ): void {
    if (original.length !== reversal.length) {
      throw new FinanceValidationError(
        "A reversal must have the same number of lines as the operation it reverses.",
        { originalLines: original.length, reversalLines: reversal.length },
      );
    }

    const remaining = [...reversal];

    for (const line of original) {
      const matchIndex = remaining.findIndex(
        (candidate) =>
          candidate.accountId === line.accountId &&
          candidate.signedAmountMinor === -line.signedAmountMinor,
      );

      if (matchIndex === -1) {
        throw new FinanceValidationError(
          `Reversal is missing the inverse of the ${line.accountCode} line.`,
          {
            accountId: line.accountId,
            signedAmountMinor: line.signedAmountMinor,
          },
        );
      }

      remaining.splice(matchIndex, 1);
    }
  }
}
