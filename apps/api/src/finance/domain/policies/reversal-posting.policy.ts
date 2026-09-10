/**
 * Undoes a posted operation without erasing it.
 *
 * A posted operation is history. Correcting it by editing the numbers would
 * leave no trace that the original ever said something else, which is exactly
 * what an audit trail exists to prevent. Instead a REVERSAL operation posts
 * the exact inverse of every original line: the balances return to where they
 * were, and both entries remain readable side by side.
 *
 * The inverse is line-for-line, not merely balanced overall. Reversing a
 * three-line mixed payment produces three lines against the same three
 * accounts — otherwise the totals would come out right while individual
 * account balances stayed wrong.
 */
import { Injectable } from "@nestjs/common";

import { FinanceStateError } from "../finance.errors";
import type { PostingLine, PostingPlan } from "../posting-plan";
import { summarizePostings } from "../posting-plan";
import type { EconomicAllocationCommand } from "../finance.types";

export interface ReversalSource {
  operationId: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  postings: readonly PostingLine[];
  /** The original allocations, so the summary can show benefit being undone. */
  allocations: readonly EconomicAllocationCommand[];
}

@Injectable()
export class ReversalPostingPolicy {
  /**
   * @throws {FinanceStateError} when the operation was never posted, or has
   * already been reversed — reversing twice would double the correction.
   */
  build(source: ReversalSource): PostingPlan {
    if (source.status === "DRAFT") {
      throw new FinanceStateError(
        "This operation was never posted, so there is nothing to reverse.",
        { operationId: source.operationId },
      );
    }

    if (source.status === "REVERSED") {
      throw new FinanceStateError("This operation has already been reversed.", {
        operationId: source.operationId,
      });
    }

    if (source.postings.length === 0) {
      throw new FinanceStateError(
        "This operation has no journal entry to reverse.",
        { operationId: source.operationId },
      );
    }

    const postings = source.postings.map((line) => ({
      ...line,
      signedAmountMinor: -line.signedAmountMinor,
      description: `Reversal of: ${line.description}`,
    }));

    // The benefit is withdrawn along with the money, so the summary mirrors
    // the original allocations too.
    const reversedAllocations = source.allocations.map((allocation) =>
      allocation.type === "COMMON"
        ? { ...allocation, amountMinor: -allocation.amountMinor }
        : { ...allocation, amountMinor: -allocation.amountMinor },
    );

    return {
      postings,
      summary: summarizePostings(postings, reversedAllocations),
    };
  }
}
