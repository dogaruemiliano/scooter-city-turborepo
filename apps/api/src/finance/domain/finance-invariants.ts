/**
 * The rules an operation must satisfy before it is allowed near the ledger.
 *
 * Every rule here is also enforced by a database constraint. That duplication
 * is deliberate: the database is the guarantee, this file is the explanation.
 * A caller who sends allocations totalling 900 when the expense is 1,000
 * deserves a sentence saying so, not a 500 from a CHECK violation.
 */
import { v1 } from "@repo/api-shared";

import { FinanceValidationError } from "./finance.errors";
import type {
  EconomicAllocationCommand,
  ExpenseCommand,
  ExpensePaymentCommand,
  ResolvedLedgerAccount,
} from "./finance.types";
import { assertPositiveAmount, sumAmountMinor } from "./money";

const PAYMENT_SOURCE_ROLES = new Set<v1.finance.LedgerAccountRole>(
  v1.finance.EXPENSE_PAYMENT_SOURCE_ROLES,
);

/** Prevents company costs and private-pool costs from crossing books. */
export function assertTreatmentAllowedForBook(
  treatment: v1.finance.ExpenseTreatment,
  bookType: v1.finance.FinanceBookType,
): void {
  if (
    !v1.finance.EXPENSE_TREATMENTS_BY_BOOK_TYPE[bookType].includes(treatment)
  ) {
    throw new FinanceValidationError(
      `Treatment ${treatment} is not allowed in the ${bookType} finance book.`,
      { treatment, bookType },
    );
  }
}

/**
 * Checks an expense command end to end.
 *
 * Note what is *not* checked: whether the expense is legitimate, tax
 * deductible, or fair. Every registered expense is a real book expense by
 * definition — a purely personal purchase is a different operation kind
 * entirely (`PERSONAL_USE`), not a rejected expense.
 */
export function assertExpenseInvariants(command: ExpenseCommand): void {
  assertPositiveAmount(command.amountMinor, "Expense amount");

  if (command.payments.length === 0) {
    throw new FinanceValidationError("An expense needs at least one payment.");
  }

  if (command.allocations.length === 0) {
    throw new FinanceValidationError(
      "An expense needs at least one benefit allocation.",
    );
  }

  command.payments.forEach(assertPaymentShape);
  command.allocations.forEach(assertAllocationShape);

  const paymentsTotal = sumAmountMinor(command.payments);
  if (paymentsTotal !== command.amountMinor) {
    throw new FinanceValidationError(
      `Payments total ${paymentsTotal} but the expense is ${command.amountMinor}.`,
      { paymentsTotal, amountMinor: command.amountMinor },
    );
  }

  const allocationsTotal = sumAmountMinor(command.allocations);
  if (allocationsTotal !== command.amountMinor) {
    throw new FinanceValidationError(
      `Benefit allocations total ${allocationsTotal} but the expense is ${command.amountMinor}.`,
      { allocationsTotal, amountMinor: command.amountMinor },
    );
  }

  assertOneLinePerBeneficiary(command.allocations);
}

/**
 * A payment names either a book account or a paying associate — never both.
 * Personal funds are not a ledger account: the book records what it owes the
 * payer, not what the payer has left.
 */
export function assertPaymentShape(payment: ExpensePaymentCommand): void {
  assertPositiveAmount(payment.amountMinor, "Payment amount");

  if (payment.sourceType === "BOOK_ACCOUNT") {
    if (!payment.sourceAccountId) {
      throw new FinanceValidationError(
        "A payment from a book account must name the account.",
      );
    }
    return;
  }

  if (!payment.payerAssociateId) {
    throw new FinanceValidationError(
      "A payment from personal funds must name the associate who paid.",
    );
  }
}

/** A common benefit has no beneficiary; a specific benefit must name one. */
export function assertAllocationShape(
  allocation: EconomicAllocationCommand,
): void {
  assertPositiveAmount(allocation.amountMinor, "Allocation amount");

  if (allocation.type === "ASSOCIATE_SPECIFIC" && !allocation.associateId) {
    throw new FinanceValidationError(
      "A specific benefit allocation must name the associate who benefited.",
    );
  }
}

/** Keeps settlement arithmetic auditable: one line per beneficiary. */
export function assertOneLinePerBeneficiary(
  allocations: readonly EconomicAllocationCommand[],
): void {
  const seen = new Set<string>();

  for (const allocation of allocations) {
    const key =
      allocation.type === "COMMON" ? "COMMON" : allocation.associateId;

    if (seen.has(key)) {
      throw new FinanceValidationError(
        allocation.type === "COMMON"
          ? "Combine the common benefit into a single allocation line."
          : "Each associate may appear only once in the benefit allocation.",
      );
    }

    seen.add(key);
  }
}

/**
 * Cross-book postings would let money vanish from one book and appear in
 * another with nothing linking them.
 */
export function assertAccountInBook(
  account: ResolvedLedgerAccount,
  bookId: string,
): void {
  if (account.bookId !== bookId) {
    throw new FinanceValidationError(
      `Account ${account.code} belongs to a different finance book.`,
      { accountId: account.id, expectedBookId: bookId },
    );
  }
}

export function assertAccountActive(account: ResolvedLedgerAccount): void {
  if (!account.isActive) {
    throw new FinanceValidationError(
      `Account ${account.code} is archived and cannot take new postings.`,
      { accountId: account.id },
    );
  }
}

/**
 * Money can only be spent from somewhere it is actually held. Expense and
 * revenue accounts are not wallets.
 */
export function assertUsableAsPaymentSource(
  account: ResolvedLedgerAccount,
): void {
  if (account.category !== "ASSET" || !PAYMENT_SOURCE_ROLES.has(account.role)) {
    throw new FinanceValidationError(
      `${account.name} cannot be used to pay an expense. Choose a bank, cash register, or cash-custody account.`,
      { accountId: account.id, role: account.role },
    );
  }
}

/** An account's role fixes its category; a mismatch corrupts every balance. */
export function assertRoleMatchesCategory(
  role: v1.finance.LedgerAccountRole,
  category: v1.finance.LedgerAccountCategory,
): void {
  const expected = v1.finance.LEDGER_ROLE_CATEGORY[role];

  if (expected !== category) {
    throw new FinanceValidationError(
      `Ledger role ${role} must be recorded as ${expected}, not ${category}.`,
      { role, category, expected },
    );
  }
}

/**
 * Ownership shares must account for the whole book. Anything else makes the
 * expected side of a settlement meaningless.
 */
export function assertSharesTotalWhole(
  shares: ReadonlyArray<{ shareBasisPoints: number }>,
): void {
  if (shares.length === 0) {
    throw new FinanceValidationError(
      "This finance book has no active members, so nothing can be settled.",
    );
  }

  const total = shares.reduce((sum, share) => sum + share.shareBasisPoints, 0);

  if (total !== v1.finance.TOTAL_SHARE_BASIS_POINTS) {
    throw new FinanceValidationError(
      `Active ownership shares total ${total} basis points; they must total ${v1.finance.TOTAL_SHARE_BASIS_POINTS}.`,
      { total },
    );
  }
}
