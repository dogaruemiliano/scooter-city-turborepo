/**
 * The posting plan: what an operation does to the books, before it is saved.
 *
 * One plan powers both the preview endpoint and the create endpoint. That is
 * the whole point — a preview that computes its numbers separately from the
 * posting engine is a preview that will eventually lie.
 *
 * The plain-language summary is *derived from the posting lines*, never
 * accumulated alongside them. If the lines say the bank went down 300, the
 * summary cannot say anything else.
 */
import { v1 } from "@repo/api-shared";

import type {
  EconomicAllocationCommand,
  ResolvedLedgerAccount,
} from "./finance.types";
import { groupByAssociate, sumMinor, type AssociateAmount } from "./money";

export type { AssociateAmount } from "./money";

/** One ledger line. Positive debits, negative credits. */
export interface PostingLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountRole: v1.finance.LedgerAccountRole;
  accountCategory: v1.finance.LedgerAccountCategory;
  associateId: string | null;
  signedAmountMinor: number;
  description: string;
}

export interface PostingImpactSummary {
  companyExpenseMinor: number;
  companyAssetIncreaseMinor: number;
  companyCashImpactMinor: number;
  companyEquityIncreaseMinor: number;
  associatePayables: AssociateAmount[];
  associateReceivables: AssociateAmount[];
  specificEconomicBenefits: AssociateAmount[];
  commonEconomicBenefitMinor: number;
}

export interface PostingPlan {
  postings: PostingLine[];
  summary: PostingImpactSummary;
}

/** Roles that hold the book's own spendable money. */
const CASH_ROLES = new Set<v1.finance.LedgerAccountRole>([
  "BANK",
  "CASH_REGISTER",
  "COMPANY_CASH_CUSTODY",
  "ASSOCIATE_POOL_CASH_CUSTODY",
]);

/** Roles recording money the book owes an associate. */
const PAYABLE_ROLES = new Set<v1.finance.LedgerAccountRole>([
  "PAYABLE_TO_ASSOCIATE",
  "ASSOCIATE_LOAN_PAYABLE",
]);

/** Builds a posting line from a resolved account. */
export function postingLine(
  account: ResolvedLedgerAccount,
  signedAmountMinor: number,
  description: string,
): PostingLine {
  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    accountRole: account.role,
    accountCategory: account.category,
    associateId: account.associateId,
    signedAmountMinor,
    description,
  };
}

/**
 * Reads the consequences of a set of posting lines.
 *
 * Sign handling follows the ledger convention: assets and expenses rise with
 * a positive amount, liabilities and revenue rise with a negative one. So a
 * payable *increase* is the negation of its posted amount — which is why
 * `associatePayables` reports positive numbers for money owed.
 *
 * @param postings The lines about to be written.
 * @param allocations Who benefited. Independent of who paid, so it cannot be
 * read off the postings and has to be passed in.
 */
export function summarizePostings(
  postings: readonly PostingLine[],
  allocations: readonly EconomicAllocationCommand[] = [],
): PostingImpactSummary {
  const expenseMinor = sumMinor(
    postings
      .filter((line) => line.accountCategory === "EXPENSE")
      .map((line) => line.signedAmountMinor),
  );

  const assetIncreaseMinor = sumMinor(
    postings
      .filter((line) => line.accountRole === "FIXED_ASSET")
      .map((line) => line.signedAmountMinor),
  );

  const cashImpactMinor = sumMinor(
    postings
      .filter((line) => CASH_ROLES.has(line.accountRole))
      .map((line) => line.signedAmountMinor),
  );

  const signedEquityMinor = sumMinor(
    postings
      .filter((line) => line.accountCategory === "EQUITY")
      .map((line) => line.signedAmountMinor),
  );
  const equityIncreaseMinor = signedEquityMinor === 0 ? 0 : -signedEquityMinor;

  const associatePayables = groupByAssociate(
    postings
      .filter((line) => PAYABLE_ROLES.has(line.accountRole) && line.associateId)
      .map((line) => ({
        associateId: line.associateId as string,
        // Liabilities are credited, so a rising debt posts negative.
        amountMinor: -line.signedAmountMinor,
      })),
  );

  const associateReceivables = groupByAssociate(
    postings
      .filter(
        (line) =>
          line.accountRole === "RECEIVABLE_FROM_ASSOCIATE" && line.associateId,
      )
      .map((line) => ({
        associateId: line.associateId as string,
        amountMinor: line.signedAmountMinor,
      })),
  );

  const specificEconomicBenefits = groupByAssociate(
    allocations
      .filter((allocation) => allocation.type === "ASSOCIATE_SPECIFIC")
      .map((allocation) => ({
        associateId: allocation.associateId,
        amountMinor: allocation.amountMinor,
      })),
  );

  const commonEconomicBenefitMinor = sumMinor(
    allocations
      .filter((allocation) => allocation.type === "COMMON")
      .map((allocation) => allocation.amountMinor),
  );

  return {
    companyExpenseMinor: expenseMinor,
    companyAssetIncreaseMinor: assetIncreaseMinor,
    companyCashImpactMinor: cashImpactMinor,
    companyEquityIncreaseMinor: equityIncreaseMinor,
    associatePayables,
    associateReceivables,
    specificEconomicBenefits,
    commonEconomicBenefitMinor,
  };
}
