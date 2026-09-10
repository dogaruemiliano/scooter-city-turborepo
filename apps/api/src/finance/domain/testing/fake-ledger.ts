/**
 * A ledger stub for unit tests.
 *
 * The posting policies only need to turn a role into an account, so tests get
 * an in-memory chart of accounts instead of a database. Everything a policy
 * decides is then a pure function of its input, which is the point of keeping
 * the resolver behind a port.
 */
import { v1 } from "@repo/api-shared";

import { LedgerConfigurationError } from "../finance.errors";
import type {
  LedgerAccountResolverPort,
  LedgerAccountSelector,
  ResolvedLedgerAccount,
} from "../finance.types";

export const BOOK_ID = "book-company";
export const EMILIANO = "user-emiliano";
export const IUSTI = "user-iusti";

function account(
  id: string,
  code: string,
  name: string,
  role: v1.finance.LedgerAccountRole,
  associateId: string | null = null,
  bookId = BOOK_ID,
): ResolvedLedgerAccount {
  return {
    id,
    bookId,
    code,
    name,
    category: v1.finance.LEDGER_ROLE_CATEGORY[role],
    role,
    associateId,
    isActive: true,
  };
}

export const ACCOUNTS = {
  bank: account(
    "acc-bank",
    "COMPANY_BANK_DEFAULT",
    "Default Company Bank",
    "BANK",
  ),
  cashRegister: account(
    "acc-cash-register",
    "COMPANY_CASH_REGISTER",
    "Company Cash Register",
    "CASH_REGISTER",
  ),
  operatingExpense: account(
    "acc-operating-expense",
    "COMPANY_OPERATING_EXPENSE",
    "Operating Expenses",
    "OPERATING_EXPENSE",
  ),
  nonOperationalExpense: account(
    "acc-non-operational-expense",
    "COMPANY_NON_OPERATIONAL_EXPENSE",
    "Non-operational Company Expenses",
    "NON_OPERATIONAL_COMPANY_EXPENSE",
  ),
  fixedAsset: account(
    "acc-fixed-asset",
    "COMPANY_FIXED_ASSET",
    "Fixed Assets",
    "FIXED_ASSET",
  ),
  rentalRevenue: account(
    "acc-rental-revenue",
    "COMPANY_RENTAL_REVENUE",
    "Rental Revenue",
    "RENTAL_REVENUE",
  ),
  custodyEmiliano: account(
    "acc-custody-emiliano",
    "COMPANY_CASH_CUSTODY_EMILIANO",
    "Company Cash Held by Emiliano",
    "COMPANY_CASH_CUSTODY",
    EMILIANO,
  ),
  payableEmiliano: account(
    "acc-payable-emiliano",
    "COMPANY_PAYABLE_EMILIANO",
    "Payable to Emiliano",
    "PAYABLE_TO_ASSOCIATE",
    EMILIANO,
  ),
  payableIusti: account(
    "acc-payable-iusti",
    "COMPANY_PAYABLE_IUSTI",
    "Payable to Iusti",
    "PAYABLE_TO_ASSOCIATE",
    IUSTI,
  ),
  loanPayableEmiliano: account(
    "acc-loan-payable-emiliano",
    "COMPANY_LOAN_PAYABLE_EMILIANO",
    "Associate Loan Payable to Emiliano",
    "ASSOCIATE_LOAN_PAYABLE",
    EMILIANO,
  ),
  contributedCapital: account(
    "acc-contributed-capital",
    "COMPANY_CONTRIBUTED_CAPITAL",
    "Contributed Capital",
    "CONTRIBUTED_CAPITAL",
  ),
  receivableEmiliano: account(
    "acc-receivable-emiliano",
    "COMPANY_RECEIVABLE_EMILIANO",
    "Receivable from Emiliano",
    "RECEIVABLE_FROM_ASSOCIATE",
    EMILIANO,
  ),
  /** Belongs to another book — used to prove cross-book postings are refused. */
  poolCashEmiliano: account(
    "acc-pool-cash-emiliano",
    "POOL_CASH_CUSTODY_EMILIANO",
    "Pool Cash Held by Emiliano",
    "ASSOCIATE_POOL_CASH_CUSTODY",
    EMILIANO,
    "book-pool",
  ),
} as const;

export class FakeLedgerAccountResolver implements LedgerAccountResolverPort {
  private readonly accounts: ResolvedLedgerAccount[];

  constructor(accounts: ResolvedLedgerAccount[] = Object.values(ACCOUNTS)) {
    this.accounts = accounts;
  }

  resolve(selector: LedgerAccountSelector): Promise<ResolvedLedgerAccount> {
    const matches = this.accounts.filter(
      (candidate) =>
        candidate.bookId === selector.bookId &&
        candidate.role === selector.role &&
        candidate.associateId === (selector.associateId ?? null),
    );

    if (matches.length !== 1) {
      return Promise.reject(
        new LedgerConfigurationError(
          `Expected exactly one ${selector.role} account, found ${matches.length}.`,
          { ...selector },
        ),
      );
    }

    return Promise.resolve(matches[0]);
  }

  resolveById(
    bookId: string,
    accountId: string,
  ): Promise<ResolvedLedgerAccount> {
    const match = this.accounts.find((candidate) => candidate.id === accountId);

    if (!match) {
      return Promise.reject(
        new LedgerConfigurationError("No such account.", { accountId, bookId }),
      );
    }

    // Book ownership is checked by the policy, not hidden here, so the test
    // exercises the same guard production does.
    return Promise.resolve(match);
  }
}

/** Reads a posting amount by account id, for concise assertions. */
export function amountFor(
  postings: ReadonlyArray<{ accountId: string; signedAmountMinor: number }>,
  accountId: string,
): number | undefined {
  return postings.find((line) => line.accountId === accountId)
    ?.signedAmountMinor;
}
