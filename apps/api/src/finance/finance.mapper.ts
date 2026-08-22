/**
 * Database rows to API resources.
 *
 * The one thing worth noticing here: an operation's impact summary is
 * recomputed from its persisted journal postings by the same function that
 * builds the preview summary. It is never stored. So the numbers a user saw
 * before confirming and the numbers they see afterwards come from one piece
 * of code, and cannot drift apart.
 */
import { v1 } from "@repo/api-shared";

import type { EconomicAllocationCommand } from "./domain/finance.types";
import { summarizePostings, type PostingLine } from "./domain/posting-plan";
import type {
  FinanceBookRecord,
  LedgerAccountRecord,
  OperationRecord,
} from "./infrastructure/prisma-finance.repository";
import type {
  CostObject as CostObjectRow,
  ExpenseCategory as ExpenseCategoryRow,
  LedgerAccount as LedgerAccountRow,
} from "../generated/prisma/client";

interface AssociateRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export function toFinanceAssociate(
  row: AssociateRow,
): v1.finance.FinanceAssociate {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();

  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: name || row.email,
  };
}

export function toFinanceBook(row: FinanceBookRecord): v1.finance.FinanceBook {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    functionalCurrency: row.functionalCurrency,
    members: row.members.map((member) => ({
      id: member.id,
      associateId: member.associateId,
      associate: member.associate ? toFinanceAssociate(member.associate) : null,
      shareBasisPoints: member.shareBasisPoints,
      validFrom: member.validFrom.toISOString(),
      validUntil: member.validUntil?.toISOString() ?? null,
    })),
  };
}

export function toLedgerAccount(
  row: LedgerAccountRecord,
): v1.finance.LedgerAccount {
  return {
    id: row.id,
    bookId: row.bookId,
    code: row.code,
    name: row.name,
    category: row.category,
    role: row.role,
    associateId: row.associateId,
    associate: row.associate ? toFinanceAssociate(row.associate) : null,
    isDefault: row.isDefault,
    isActive: row.isActive,
    isSystem: row.isSystem,
  };
}

export function toLedgerAccountRef(
  row: LedgerAccountRow,
): v1.finance.LedgerAccountRef {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    role: row.role,
    associateId: row.associateId,
  };
}

/**
 * Assets and expenses read naturally as their signed balance; liabilities,
 * revenue, and equity are negative when they grow, so they are negated for
 * display. "Company owes Iusti 200" should read as 200, not -200.
 */
export function toLedgerAccountBalance(
  account: LedgerAccountRecord,
  balance: { signedBalanceMinor: number; postingCount: number } | undefined,
  asOf: Date,
): v1.finance.LedgerAccountBalance {
  const signedBalanceMinor = balance?.signedBalanceMinor ?? 0;
  const negatesForDisplay =
    account.category === "LIABILITY" ||
    account.category === "REVENUE" ||
    account.category === "EQUITY";

  return {
    accountId: account.id,
    bookId: account.bookId,
    code: account.code,
    name: account.name,
    category: account.category,
    role: account.role,
    associateId: account.associateId,
    signedBalanceMinor,
    displayBalanceMinor: negatesForDisplay
      ? -signedBalanceMinor
      : signedBalanceMinor,
    postingCount: balance?.postingCount ?? 0,
    asOf: asOf.toISOString(),
  };
}

export function toExpenseCategory(
  row: ExpenseCategoryRow,
): v1.finance.ExpenseCategory {
  return {
    id: row.id,
    bookId: row.bookId,
    code: row.code,
    name: row.name,
    defaultTreatment: row.defaultTreatment,
    isActive: row.isActive,
  };
}

export function toCostObject(row: CostObjectRow): v1.finance.CostObject {
  return {
    id: row.id,
    bookId: row.bookId,
    code: row.code,
    name: row.name,
    type: row.type,
    ownershipType: row.ownershipType,
    ownerAssociateId: row.ownerAssociateId,
    externalEntityType: row.externalEntityType,
    externalEntityId: row.externalEntityId,
    defaultAllocationType: row.defaultAllocationType,
    defaultBeneficiaryAssociateId: row.defaultBeneficiaryAssociateId,
    isActive: row.isActive,
  };
}

/** Persisted postings, in the shape the domain works with. */
export function toDomainPostingLines(row: OperationRecord): PostingLine[] {
  return (row.journalEntry?.postings ?? []).map((posting) => ({
    accountId: posting.accountId,
    accountCode: posting.account.code,
    accountName: posting.account.name,
    accountRole: posting.account.role,
    accountCategory: posting.account.category,
    associateId: posting.account.associateId,
    signedAmountMinor: posting.signedAmountMinor,
    description: posting.description ?? "",
  }));
}

/** Persisted allocations, in the shape the domain works with. */
export function toDomainAllocationCommands(
  row: OperationRecord,
): EconomicAllocationCommand[] {
  return row.allocations.map(
    (allocation): EconomicAllocationCommand =>
      allocation.type === "ASSOCIATE_SPECIFIC" && allocation.associateId
        ? {
            type: "ASSOCIATE_SPECIFIC",
            associateId: allocation.associateId,
            amountMinor: allocation.amountMinor,
          }
        : { type: "COMMON", amountMinor: allocation.amountMinor },
  );
}

export function toFinancialOperation(
  row: OperationRecord,
): v1.finance.FinancialOperation {
  return {
    id: row.id,
    bookId: row.bookId,
    bookType: row.book.type,
    kind: row.kind,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
    description: row.description,
    idempotencyKey: row.idempotencyKey,
    createdById: row.createdById,
    postedAt: row.postedAt?.toISOString() ?? null,
    reversalOfOperationId: row.reversalOfOperationId,
    reversedByOperationId: row.reversedBy?.id ?? null,
    expense: row.expense
      ? {
          id: row.expense.id,
          amountMinor: row.expense.amountMinor,
          treatment: row.expense.treatment,
          categoryId: row.expense.categoryId,
          category: row.expense.category
            ? toExpenseCategory(row.expense.category)
            : null,
          costObjectId: row.expense.costObjectId,
          costObject: row.expense.costObject
            ? toCostObject(row.expense.costObject)
            : null,
          payments: row.expense.payments.map((payment) => ({
            id: payment.id,
            sourceType: payment.sourceType,
            amountMinor: payment.amountMinor,
            paymentMethod: payment.paymentMethod,
            sourceAccountId: payment.sourceAccountId,
            sourceAccount: payment.sourceAccount
              ? toLedgerAccountRef(payment.sourceAccount)
              : null,
            payerAssociateId: payment.payerAssociateId,
            payerAssociate: payment.payerAssociate
              ? toFinanceAssociate(payment.payerAssociate)
              : null,
          })),
        }
      : null,
    associateFunding: row.associateFunding
      ? {
          id: row.associateFunding.id,
          type: row.associateFunding.type,
          associateId: row.associateFunding.associateId,
          associate: toFinanceAssociate(row.associateFunding.associate),
          destinationAccountId: row.associateFunding.destinationAccountId,
          destinationAccount: toLedgerAccountRef(
            row.associateFunding.destinationAccount,
          ),
          amountMinor: row.associateFunding.amountMinor,
          reference: row.associateFunding.reference,
          notes: row.associateFunding.notes,
        }
      : null,
    allocations: row.allocations.map((allocation) => ({
      id: allocation.id,
      type: allocation.type,
      amountMinor: allocation.amountMinor,
      associateId: allocation.associateId,
      associate: allocation.associate
        ? toFinanceAssociate(allocation.associate)
        : null,
    })),
    documents: row.documents.map((document) => ({
      id: document.id,
      type: document.type,
      documentNumber: document.documentNumber,
      issuedAt: document.issuedAt?.toISOString() ?? null,
      supplierName: document.supplierName,
      supplierTaxId: document.supplierTaxId,
      storageKey: document.storageKey,
      notes: document.notes,
    })),
    journalEntry: row.journalEntry
      ? {
          id: row.journalEntry.id,
          postedAt: row.journalEntry.postedAt.toISOString(),
          postings: row.journalEntry.postings.map((posting) => ({
            id: posting.id,
            lineNumber: posting.lineNumber,
            accountId: posting.accountId,
            account: toLedgerAccountRef(posting.account),
            signedAmountMinor: posting.signedAmountMinor,
            description: posting.description,
          })),
        }
      : null,
    summary: summarizePostings(
      toDomainPostingLines(row),
      toDomainAllocationCommands(row),
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toFinancialOperationListItem(
  row: OperationRecord,
): v1.finance.FinancialOperationListItem {
  // Reversals carry no detail record; their size is the magnitude of one
  // side of the entry, which equals the original operation's amount.
  const reversalAmountMinor = (row.journalEntry?.postings ?? [])
    .filter((posting) => posting.signedAmountMinor > 0)
    .reduce((total, posting) => total + posting.signedAmountMinor, 0);

  return {
    id: row.id,
    bookId: row.bookId,
    bookType: row.book.type,
    kind: row.kind,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
    description: row.description,
    amountMinor:
      row.expense?.amountMinor ??
      row.associateFunding?.amountMinor ??
      reversalAmountMinor,
    treatment: row.expense?.treatment ?? null,
    categoryName: row.expense?.category?.name ?? null,
    costObjectName: row.expense?.costObject?.name ?? null,
    postedAt: row.postedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
