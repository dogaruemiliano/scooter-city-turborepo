/**
 * Corrects a posted operation by posting its exact inverse.
 *
 * Nothing about the original is edited or deleted. Afterwards the books show
 * both entries and both are true: this happened, and then it was undone.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  FinanceNotFoundError,
  FinanceStateError,
  IdempotencyConflictError,
} from "../domain/finance.errors";
import { JournalValidator } from "../domain/journal-validator";
import { ReversalPostingPolicy } from "../domain/policies/reversal-posting.policy";
import {
  toDomainAllocationCommands,
  toDomainPostingLines,
  toFinancialOperation,
} from "../finance.mapper";
import {
  ConcurrentReversalError,
  PrismaFinanceRepository,
  type OperationRecord,
} from "../infrastructure/prisma-finance.repository";

export interface ReverseOperationRequest {
  operationId: string;
  input: v1.finance.ReverseOperationInput;
  idempotencyKey: string;
  createdById: string;
}

@Injectable()
export class ReverseOperationUseCase {
  constructor(
    private readonly policy: ReversalPostingPolicy,
    private readonly journal: JournalValidator,
    private readonly repository: PrismaFinanceRepository,
  ) {}

  async execute({
    operationId,
    input,
    idempotencyKey,
    createdById,
  }: ReverseOperationRequest): Promise<v1.finance.FinancialOperation> {
    const original = await this.repository.findOperationById(operationId);

    if (!original) {
      throw new FinanceNotFoundError("That operation does not exist.", {
        operationId,
      });
    }

    const replay = await this.resolveReplay(
      original.bookId,
      idempotencyKey,
      operationId,
    );
    if (replay) return replay;

    const originalPostings = toDomainPostingLines(original);

    const plan = this.policy.build({
      operationId: original.id,
      status: original.status,
      postings: originalPostings,
      allocations: toDomainAllocationCommands(original),
    });

    this.journal.assertBalanced(plan.postings);
    // Balancing is not enough — a reversal must undo each line individually,
    // or account balances end up wrong while the totals look right.
    this.journal.assertExactInverse(originalPostings, plan.postings);

    let reversalId: string;

    try {
      reversalId = await this.repository.createReversal({
        bookId: original.bookId,
        originalOperationId: original.id,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        description: describeReversal(original, input.reason),
        idempotencyKey,
        createdById,
        postings: plan.postings,
      });
    } catch (error) {
      if (error instanceof ConcurrentReversalError) {
        throw new FinanceStateError(
          "This operation has already been reversed.",
          { operationId },
        );
      }
      throw error;
    }

    const reversal = await this.repository.findOperationById(reversalId);

    if (!reversal) {
      throw new FinanceNotFoundError(
        "The reversal was saved but could not be read back.",
        { operationId: reversalId },
      );
    }

    return toFinancialOperation(reversal);
  }

  /**
   * A replayed key must name a reversal of the *same* operation; pointing it
   * at a different one is a different command wearing the same key.
   */
  private async resolveReplay(
    bookId: string,
    idempotencyKey: string,
    operationId: string,
  ): Promise<v1.finance.FinancialOperation | null> {
    const existing = await this.repository.findOperationByIdempotencyKey(
      bookId,
      idempotencyKey,
    );

    if (!existing) return null;

    if (existing.reversalOfOperationId !== operationId) {
      throw new IdempotencyConflictError(
        "This idempotency key was already used for a different operation. Use a new key.",
        { idempotencyKey, operationId: existing.id },
      );
    }

    return toFinancialOperation(existing);
  }
}

function describeReversal(
  original: OperationRecord,
  reason?: string | null,
): string {
  const subject = original.description
    ? `"${original.description}"`
    : original.kind.toLowerCase();

  return reason
    ? `Reversal of ${subject}: ${reason}`
    : `Reversal of ${subject}`;
}
