import { Inject, Injectable } from "@nestjs/common";

import {
  assertAccountActive,
  assertAccountInBook,
} from "../finance-invariants";
import { FinanceValidationError } from "../finance.errors";
import { LEDGER_ACCOUNT_RESOLVER } from "../finance.tokens";
import type {
  AssociateFundingCommand,
  LedgerAccountResolverPort,
  ResolvedLedgerAccount,
} from "../finance.types";
import { assertPositiveAmount } from "../money";
import {
  postingLine,
  summarizePostings,
  type PostingPlan,
} from "../posting-plan";

const FUNDING_DESTINATION_ROLES = new Set([
  "BANK",
  "CASH_REGISTER",
  "COMPANY_CASH_CUSTODY",
]);

@Injectable()
export class AssociateFundingPostingPolicy {
  constructor(
    @Inject(LEDGER_ACCOUNT_RESOLVER)
    private readonly accounts: LedgerAccountResolverPort,
  ) {}

  async build(command: AssociateFundingCommand): Promise<PostingPlan> {
    assertPositiveAmount(command.amountMinor, "Funding amount");

    const destination = await this.accounts.resolveById(
      command.bookId,
      command.destinationAccountId,
    );
    this.assertFundingDestination(destination, command.bookId);

    const credit = await this.accounts.resolve(
      command.type === "LOAN"
        ? {
            bookId: command.bookId,
            role: "ASSOCIATE_LOAN_PAYABLE",
            associateId: command.associateId,
          }
        : { bookId: command.bookId, role: "CONTRIBUTED_CAPITAL" },
    );

    const postings = [
      postingLine(
        destination,
        command.amountMinor,
        `Money received in ${destination.name}`,
      ),
      postingLine(
        credit,
        -command.amountMinor,
        command.type === "LOAN"
          ? "Associate loan received"
          : "Capital contribution received",
      ),
    ];

    return { postings, summary: summarizePostings(postings) };
  }

  private assertFundingDestination(
    account: ResolvedLedgerAccount,
    bookId: string,
  ): void {
    assertAccountInBook(account, bookId);
    assertAccountActive(account);

    if (
      account.category !== "ASSET" ||
      !FUNDING_DESTINATION_ROLES.has(account.role)
    ) {
      throw new FinanceValidationError(
        "Choose a company bank account, cash register, or company cash-custody account.",
        { accountId: account.id, role: account.role },
      );
    }
  }
}
