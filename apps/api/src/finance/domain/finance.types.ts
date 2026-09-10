/**
 * Framework-free shapes shared by the finance domain and application layers.
 *
 * Commands are what a use case hands to a posting policy: already-parsed,
 * already-authorized, and carrying no HTTP or Prisma types. Ports are the
 * narrow interfaces the domain needs from infrastructure — the domain
 * defines them, infrastructure implements them.
 */
import type { v1 } from "@repo/api-shared";

export type LedgerAccountRole = v1.finance.LedgerAccountRole;
export type LedgerAccountCategory = v1.finance.LedgerAccountCategory;
export type ExpenseTreatment = v1.finance.ExpenseTreatment;
export type PaymentMethod = v1.finance.PaymentMethod;
export type FinanceBookType = v1.finance.FinanceBookType;

/** A ledger account as the domain needs to see it. */
export interface ResolvedLedgerAccount {
  id: string;
  bookId: string;
  code: string;
  name: string;
  category: LedgerAccountCategory;
  role: LedgerAccountRole;
  associateId: string | null;
  isActive: boolean;
}

/**
 * How the domain asks for an account without ever knowing an account ID.
 * Hardcoding IDs is what makes a ledger impossible to seed twice.
 */
export interface LedgerAccountSelector {
  bookId: string;
  role: LedgerAccountRole;
  /** Required for associate-scoped roles; must be absent otherwise. */
  associateId?: string;
  /** Narrows to the book's default account when several share a role. */
  requireDefault?: boolean;
}

/**
 * Port for turning a selector into exactly one account.
 *
 * Implementations must throw `LedgerConfigurationError` when a selector
 * matches zero or several accounts — an ambiguous ledger is a setup bug that
 * should surface loudly, not be resolved by picking the first row.
 */
export interface LedgerAccountResolverPort {
  resolve(selector: LedgerAccountSelector): Promise<ResolvedLedgerAccount>;
  /** Loads an account the caller named directly, checking book ownership. */
  resolveById(
    bookId: string,
    accountId: string,
  ): Promise<ResolvedLedgerAccount>;
}

export type ExpensePaymentCommand =
  | {
      sourceType: "BOOK_ACCOUNT";
      sourceAccountId: string;
      paymentMethod: PaymentMethod;
      amountMinor: number;
    }
  | {
      sourceType: "ASSOCIATE_PERSONAL_FUNDS";
      payerAssociateId: string;
      paymentMethod: PaymentMethod;
      amountMinor: number;
    };

export type EconomicAllocationCommand =
  | { type: "COMMON"; amountMinor: number }
  | { type: "ASSOCIATE_SPECIFIC"; associateId: string; amountMinor: number };

/** Everything the expense posting policy needs, and nothing more. */
export interface ExpenseCommand {
  bookId: string;
  amountMinor: number;
  treatment: ExpenseTreatment;
  description?: string | null;
  payments: readonly ExpensePaymentCommand[];
  allocations: readonly EconomicAllocationCommand[];
}

export interface AssociateFundingCommand {
  bookId: string;
  amountMinor: number;
  type: v1.finance.AssociateFundingType;
  associateId: string;
  destinationAccountId: string;
}
