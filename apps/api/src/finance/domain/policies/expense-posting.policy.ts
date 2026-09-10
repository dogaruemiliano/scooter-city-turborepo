/**
 * Turns an expense into balanced ledger lines.
 *
 * The whole design rests on one separation: **who paid** and **who benefited**
 * are different questions with different answers, and neither is inferred
 * from the other.
 *
 * - The payment lines decide what the book gives up: its own cash, or a debt
 *   to the associate who advanced their own money.
 * - The benefit allocations decide nothing about the journal at all. They are
 *   carried into the summary and settled separately, later.
 *
 * Concretely: when Iusti pays 400 from personal funds and Emiliano is the
 * sole beneficiary, the company owes Iusti the full 400 — not 200. The 200
 * that Emiliano owes Iusti is a private matter between them, and it is
 * settled through a completely different mechanism. Netting the two here
 * would silently destroy a real obligation.
 */
import { Inject, Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import {
  assertAccountActive,
  assertAccountInBook,
  assertExpenseInvariants,
  assertUsableAsPaymentSource,
} from "../finance-invariants";
import { LEDGER_ACCOUNT_RESOLVER } from "../finance.tokens";
import type {
  ExpenseCommand,
  ExpensePaymentCommand,
  LedgerAccountResolverPort,
  ResolvedLedgerAccount,
} from "../finance.types";
import {
  postingLine,
  summarizePostings,
  type PostingLine,
  type PostingPlan,
} from "../posting-plan";

@Injectable()
export class ExpensePostingPolicy {
  constructor(
    @Inject(LEDGER_ACCOUNT_RESOLVER)
    private readonly accounts: LedgerAccountResolverPort,
  ) {}

  /**
   * Builds the plan for one expense.
   *
   * Debit side: a single line against the account the treatment selects — an
   * expense account for costs, the fixed-asset account when the money became
   * something the book owns.
   *
   * Credit side: one line per payment. Book money credits the account it came
   * out of; personal money credits the payer's payable, because the book now
   * owes them.
   */
  async build(command: ExpenseCommand): Promise<PostingPlan> {
    assertExpenseInvariants(command);

    const debitAccount = await this.accounts.resolve({
      bookId: command.bookId,
      role: v1.finance.EXPENSE_TREATMENT_DEBIT_ROLE[command.treatment],
    });

    const debitDescription =
      command.treatment === "CAPITAL_ASSET"
        ? "Asset acquired"
        : "Expense incurred";

    const postings: PostingLine[] = [
      postingLine(debitAccount, command.amountMinor, debitDescription),
    ];

    for (const payment of command.payments) {
      postings.push(await this.creditLineFor(command.bookId, payment));
    }

    return {
      postings,
      summary: summarizePostings(postings, command.allocations),
    };
  }

  /** The credit half of one payment line. */
  private async creditLineFor(
    bookId: string,
    payment: ExpensePaymentCommand,
  ): Promise<PostingLine> {
    if (payment.sourceType === "BOOK_ACCOUNT") {
      const source = await this.accounts.resolveById(
        bookId,
        payment.sourceAccountId,
      );

      this.assertUsableSource(source, bookId);

      return postingLine(
        source,
        -payment.amountMinor,
        `Paid from ${source.name}`,
      );
    }

    // Personal funds are never a ledger account of their own — the book only
    // records the debt it now carries. The payment method is metadata.
    const payable = await this.accounts.resolve({
      bookId,
      role: "PAYABLE_TO_ASSOCIATE",
      associateId: payment.payerAssociateId,
    });

    return postingLine(
      payable,
      -payment.amountMinor,
      "Paid from personal funds",
    );
  }

  private assertUsableSource(
    account: ResolvedLedgerAccount,
    bookId: string,
  ): void {
    assertAccountInBook(account, bookId);
    assertAccountActive(account);
    assertUsableAsPaymentSource(account);
  }
}
