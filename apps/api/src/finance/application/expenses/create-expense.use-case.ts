/**
 * Records an expense and posts it to the ledger.
 *
 * Order of operations matters:
 *
 * 1. Check the idempotency key first, so a retry costs one read.
 * 2. Validate references and build the posting plan — everything that can
 *    fail, fails here, outside any transaction.
 * 3. Assert the entry balances.
 * 4. Write everything in one transaction and flip the operation to POSTED.
 *
 * Nothing slow happens inside the transaction: no account resolution, no
 * document handling, no external calls.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  FinanceNotFoundError,
  IdempotencyConflictError,
} from "../../domain/finance.errors";
import { assertTreatmentAllowedForBook } from "../../domain/finance-invariants";
import { JournalValidator } from "../../domain/journal-validator";
import { ExpensePostingPolicy } from "../../domain/policies/expense-posting.policy";
import { toFinancialOperation } from "../../finance.mapper";
import { PrismaFinanceRepository } from "../../infrastructure/prisma-finance.repository";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  fingerprintExpenseInput,
  fingerprintStoredExpense,
  toExpenseCommand,
} from "./expense-command";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export interface CreateExpenseRequest {
  input: v1.finance.CreateExpenseInput;
  idempotencyKey: string;
  createdById: string;
}

@Injectable()
export class CreateExpenseUseCase {
  constructor(
    private readonly policy: ExpensePostingPolicy,
    private readonly journal: JournalValidator,
    private readonly repository: PrismaFinanceRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute({
    input,
    idempotencyKey,
    createdById,
  }: CreateExpenseRequest): Promise<v1.finance.FinancialOperation> {
    const replay = await this.resolveReplay(input, idempotencyKey);
    if (replay) return replay;

    await this.assertReferencesExist(input);

    const command = toExpenseCommand(input);
    const plan = await this.policy.build(command);
    this.journal.assertBalanced(plan.postings);

    let operationId: string;

    try {
      operationId = await this.repository.createPostedExpense({
        bookId: input.bookId,
        occurredAt: new Date(input.occurredAt),
        description: input.description ?? null,
        idempotencyKey,
        createdById,
        amountMinor: input.amountMinor,
        treatment: input.treatment,
        categoryId: input.categoryId,
        costObjectId: input.costObjectId ?? null,
        payments: command.payments,
        allocations: command.allocations,
        documents: input.documents ?? [],
        postings: plan.postings,
      });
    } catch (error) {
      // Two identical requests raced past the replay check. The unique index
      // on (bookId, idempotencyKey) is what actually guarantees one write;
      // the loser returns the winner's operation.
      const raced = await this.resolveRaceWinner(error, input, idempotencyKey);
      if (raced) return raced;
      throw error;
    }

    return this.loadOperation(operationId);
  }

  /** Returns the original operation when this key has already been used. */
  private async resolveReplay(
    input: v1.finance.CreateExpenseInput,
    idempotencyKey: string,
  ): Promise<v1.finance.FinancialOperation | null> {
    const existing = await this.repository.findOperationByIdempotencyKey(
      input.bookId,
      idempotencyKey,
    );

    if (!existing) return null;

    if (fingerprintStoredExpense(existing) !== fingerprintExpenseInput(input)) {
      throw new IdempotencyConflictError(
        "This idempotency key was already used for a different expense. Use a new key.",
        { idempotencyKey, operationId: existing.id },
      );
    }

    return toFinancialOperation(existing);
  }

  private async resolveRaceWinner(
    error: unknown,
    input: v1.finance.CreateExpenseInput,
    idempotencyKey: string,
  ): Promise<v1.finance.FinancialOperation | null> {
    const isDuplicateKey =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION;

    return isDuplicateKey ? this.resolveReplay(input, idempotencyKey) : null;
  }

  /**
   * Category and cost object must belong to the same book as the expense.
   * Prisma's foreign keys prove they exist; only this proves they belong.
   */
  private async assertReferencesExist(
    input: v1.finance.CreateExpenseInput,
  ): Promise<void> {
    const [book, category, costObject] = await Promise.all([
      this.repository.findBookById(input.bookId),
      this.prisma.expenseCategory.findUnique({
        where: { id: input.categoryId },
        select: { bookId: true, isActive: true, name: true },
      }),
      input.costObjectId
        ? this.prisma.costObject.findUnique({
            where: { id: input.costObjectId },
            select: { bookId: true, isActive: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    if (!book) {
      throw new FinanceNotFoundError("That finance book does not exist.", {
        bookId: input.bookId,
      });
    }

    assertTreatmentAllowedForBook(input.treatment, book.type);

    if (!category || category.bookId !== input.bookId) {
      throw new FinanceNotFoundError(
        "That expense category does not exist in this finance book.",
        { categoryId: input.categoryId },
      );
    }

    if (!category.isActive) {
      throw new FinanceNotFoundError(
        `The category "${category.name}" is archived and cannot take new expenses.`,
        { categoryId: input.categoryId },
      );
    }

    if (input.costObjectId) {
      if (!costObject || costObject.bookId !== input.bookId) {
        throw new FinanceNotFoundError(
          "That cost object does not exist in this finance book.",
          { costObjectId: input.costObjectId },
        );
      }

      if (!costObject.isActive) {
        throw new FinanceNotFoundError(
          `The cost object "${costObject.name}" is archived and cannot take new expenses.`,
          { costObjectId: input.costObjectId },
        );
      }
    }
  }

  private async loadOperation(
    operationId: string,
  ): Promise<v1.finance.FinancialOperation> {
    const row = await this.repository.findOperationById(operationId);

    if (!row) {
      throw new FinanceNotFoundError(
        "The expense was saved but could not be read back.",
        { operationId },
      );
    }

    return toFinancialOperation(row);
  }
}
