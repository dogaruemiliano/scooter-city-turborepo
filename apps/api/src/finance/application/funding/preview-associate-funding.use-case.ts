import { Injectable } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import {
  FinanceNotFoundError,
  FinanceValidationError,
} from "../../domain/finance.errors";
import { JournalValidator } from "../../domain/journal-validator";
import { AssociateFundingPostingPolicy } from "../../domain/policies/associate-funding-posting.policy";
import { PrismaFinanceRepository } from "../../infrastructure/prisma-finance.repository";
import { toAssociateFundingCommand } from "./funding-command";

@Injectable()
export class PreviewAssociateFundingUseCase {
  constructor(
    private readonly policy: AssociateFundingPostingPolicy,
    private readonly journal: JournalValidator,
    private readonly repository: PrismaFinanceRepository,
  ) {}

  async execute(
    input: v1.finance.PreviewAssociateFundingInput,
  ): Promise<v1.finance.PostingPlan> {
    const book = await this.repository.findBookById(input.bookId);
    if (!book) {
      throw new FinanceNotFoundError("That finance book does not exist.");
    }
    if (book.type !== "COMPANY") {
      throw new FinanceValidationError(
        "Company funding can only be recorded in the company finance book.",
      );
    }
    if (
      !book.members.some((member) => member.associateId === input.associateId)
    ) {
      throw new FinanceValidationError(
        "The provider must be an associate in the company finance book.",
      );
    }

    const plan = await this.policy.build(toAssociateFundingCommand(input));
    this.journal.assertBalanced(plan.postings);
    return plan;
  }
}
