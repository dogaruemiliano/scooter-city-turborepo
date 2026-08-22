/**
 * Shows what an expense would do to the books, without writing anything.
 *
 * This runs the *same* posting policy the create endpoint runs, then stops.
 * There is no second implementation of the arithmetic to keep in sync, so a
 * preview cannot promise one thing and posting deliver another.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { FinanceNotFoundError } from "../../domain/finance.errors";
import { assertTreatmentAllowedForBook } from "../../domain/finance-invariants";
import { JournalValidator } from "../../domain/journal-validator";
import { ExpensePostingPolicy } from "../../domain/policies/expense-posting.policy";
import { PrismaFinanceRepository } from "../../infrastructure/prisma-finance.repository";
import { toExpenseCommand } from "./expense-command";

@Injectable()
export class PreviewExpenseUseCase {
  constructor(
    private readonly policy: ExpensePostingPolicy,
    private readonly journal: JournalValidator,
    private readonly repository: PrismaFinanceRepository,
  ) {}

  async execute(
    input: v1.finance.PreviewExpenseInput,
  ): Promise<v1.finance.PostingPlan> {
    const book = await this.repository.findBookById(input.bookId);

    if (!book) {
      throw new FinanceNotFoundError("That finance book does not exist.", {
        bookId: input.bookId,
      });
    }

    assertTreatmentAllowedForBook(input.treatment, book.type);

    const plan = await this.policy.build(toExpenseCommand(input));

    // Previewing an entry that would not balance is worth failing on: it
    // means the caller would hit the same error on confirm.
    this.journal.assertBalanced(plan.postings);

    return plan;
  }
}
