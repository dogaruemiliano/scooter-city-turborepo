/**
 * All finance database access, in one place.
 *
 * The important method here is {@link createPostedExpense}. Everything it
 * writes — the operation, its detail rows, its payments, its allocations, its
 * documents, and its journal entry — lands inside a single transaction and
 * the operation only flips to POSTED at the very end. A crash halfway through
 * leaves no operation at all, rather than an expense with half a journal
 * entry behind it.
 *
 * The posting plan is built and validated *before* the transaction opens, so
 * the transaction stays short and holds no locks while account lookups run.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type {
  EconomicAllocationCommand,
  ExpensePaymentCommand,
} from "../domain/finance.types";
import type { PostingLine } from "../domain/posting-plan";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/** Relations every operation response needs. */
const OPERATION_INCLUDE = {
  book: true,
  reversedBy: { select: { id: true } },
  expense: {
    include: {
      category: true,
      costObject: true,
      payments: {
        include: {
          sourceAccount: true,
          payerAssociate: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  },
  associateFunding: {
    include: {
      associate: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      destinationAccount: true,
    },
  },
  allocations: {
    include: {
      associate: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  documents: { orderBy: { createdAt: "asc" } },
  journalEntry: {
    include: {
      postings: {
        include: { account: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  },
} satisfies Prisma.FinancialOperationInclude;

export type OperationRecord = Prisma.FinancialOperationGetPayload<{
  include: typeof OPERATION_INCLUDE;
}>;

export type LedgerAccountRecord = Prisma.LedgerAccountGetPayload<{
  include: {
    associate: {
      select: { id: true; email: true; firstName: true; lastName: true };
    };
  };
}>;

export type FinanceBookRecord = Prisma.FinanceBookGetPayload<{
  include: {
    members: {
      include: {
        associate: {
          select: { id: true; email: true; firstName: true; lastName: true };
        };
      };
    };
  };
}>;

export interface CreatePostedExpenseInput {
  bookId: string;
  occurredAt: Date;
  description: string | null;
  idempotencyKey: string;
  createdById: string;
  amountMinor: number;
  treatment: v1.finance.ExpenseTreatment;
  categoryId: string;
  costObjectId: string | null;
  payments: readonly ExpensePaymentCommand[];
  allocations: readonly EconomicAllocationCommand[];
  documents: readonly v1.finance.FinancialDocumentInput[];
  postings: readonly PostingLine[];
}

export interface CreatePostedAssociateFundingInput {
  bookId: string;
  occurredAt: Date;
  description: string;
  idempotencyKey: string;
  createdById: string;
  amountMinor: number;
  type: v1.finance.AssociateFundingType;
  associateId: string;
  destinationAccountId: string;
  reference: string | null;
  notes: string | null;
  proof: { draftUploadId: string; storageKey: string } | null;
  postings: readonly PostingLine[];
}

export interface CreateReversalInput {
  bookId: string;
  originalOperationId: string;
  occurredAt: Date;
  description: string;
  idempotencyKey: string;
  createdById: string;
  postings: readonly PostingLine[];
}

export interface AccountBalance {
  accountId: string;
  signedBalanceMinor: number;
  postingCount: number;
}

export interface ActiveShare {
  associateId: string;
  shareBasisPoints: number;
}

export interface SpecificBenefitRow {
  operationId: string;
  associateId: string;
  amountMinor: number;
}

/** Settlement runs that have already claimed their operations. */
const CLAIMED_SETTLEMENT_STATUSES = [
  "CONFIRMED",
  "PARTIALLY_SETTLED",
  "SETTLED",
] as const;

@Injectable()
export class PrismaFinanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Reference data
  // -------------------------------------------------------------------------

  listBooks(): Promise<FinanceBookRecord[]> {
    return this.prisma.financeBook.findMany({
      include: {
        members: {
          include: {
            associate: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { validFrom: "asc" },
        },
      },
      orderBy: { type: "asc" },
    });
  }

  findBookById(bookId: string): Promise<FinanceBookRecord | null> {
    return this.prisma.financeBook.findUnique({
      where: { id: bookId },
      include: {
        members: {
          include: {
            associate: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { validFrom: "asc" },
        },
      },
    });
  }

  findBookByType(type: v1.finance.FinanceBookType): Promise<{
    id: string;
  } | null> {
    return this.prisma.financeBook.findUnique({
      where: { type },
      select: { id: true },
    });
  }

  listAccounts(
    query: v1.finance.ListLedgerAccountsQuery & { bookId?: string },
  ): Promise<LedgerAccountRecord[]> {
    return this.prisma.ledgerAccount.findMany({
      where: {
        bookId: query.bookId,
        role: query.role,
        category: query.category,
        associateId: query.associateId,
        ...(query.includeInactive ? {} : { isActive: true }),
      },
      include: {
        associate: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ bookId: "asc" }, { code: "asc" }],
    });
  }

  findAccountById(accountId: string): Promise<LedgerAccountRecord | null> {
    return this.prisma.ledgerAccount.findUnique({
      where: { id: accountId },
      include: {
        associate: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  listExpenseCategories(query: {
    bookId?: string;
    includeInactive: boolean;
  }): Promise<
    Array<{
      id: string;
      bookId: string;
      code: string;
      name: string;
      defaultTreatment: v1.finance.ExpenseTreatment | null;
      isActive: boolean;
    }>
  > {
    return this.prisma.expenseCategory.findMany({
      where: {
        bookId: query.bookId,
        ...(query.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ name: "asc" }],
    });
  }

  listCostObjects(query: {
    bookId?: string;
    type?: v1.finance.CostObjectType;
    includeInactive: boolean;
  }) {
    return this.prisma.costObject.findMany({
      where: {
        bookId: query.bookId,
        type: query.type,
        ...(query.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ name: "asc" }],
    });
  }

  /**
   * Ownership shares in force at a moment in time. Membership is
   * time-ranged so a historical settlement keeps using the shares that
   * applied then, not whatever they are today.
   */
  async listActiveShares(bookId: string, asOf: Date): Promise<ActiveShare[]> {
    const members = await this.prisma.financeBookMember.findMany({
      where: {
        bookId,
        validFrom: { lte: asOf },
        OR: [{ validUntil: null }, { validUntil: { gt: asOf } }],
      },
      select: { associateId: true, shareBasisPoints: true },
      orderBy: { associateId: "asc" },
    });

    return members;
  }

  // -------------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------------

  findOperationById(operationId: string): Promise<OperationRecord | null> {
    return this.prisma.financialOperation.findUnique({
      where: { id: operationId },
      include: OPERATION_INCLUDE,
    });
  }

  findOperationByIdempotencyKey(
    bookId: string,
    idempotencyKey: string,
  ): Promise<OperationRecord | null> {
    return this.prisma.financialOperation.findUnique({
      where: { bookId_idempotencyKey: { bookId, idempotencyKey } },
      include: OPERATION_INCLUDE,
    });
  }

  async listOperations(
    query: v1.finance.ListFinancialOperationsQuery & { bookId?: string },
  ): Promise<{ items: OperationRecord[]; total: number }> {
    const where: Prisma.FinancialOperationWhereInput = {
      bookId: query.bookId,
      kind: query.kind,
      status: query.status,
      ...(query.treatment ? { expense: { treatment: query.treatment } } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.financialOperation.count({ where }),
      this.prisma.financialOperation.findMany({
        where,
        include: OPERATION_INCLUDE,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { items, total };
  }

  /**
   * Writes an expense and its journal entry atomically.
   *
   * The operation is inserted as DRAFT and promoted to POSTED as the final
   * statement, so "POSTED" always means "everything below it exists".
   */
  async createPostedExpense(input: CreatePostedExpenseInput): Promise<string> {
    const postedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const operation = await tx.financialOperation.create({
        data: {
          bookId: input.bookId,
          kind: "EXPENSE",
          status: "DRAFT",
          occurredAt: input.occurredAt,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          createdById: input.createdById,
        },
        select: { id: true },
      });

      const expense = await tx.expense.create({
        data: {
          operationId: operation.id,
          amountMinor: input.amountMinor,
          treatment: input.treatment,
          categoryId: input.categoryId,
          costObjectId: input.costObjectId,
        },
        select: { id: true },
      });

      await tx.expensePayment.createMany({
        data: input.payments.map((payment) => ({
          expenseId: expense.id,
          sourceType: payment.sourceType,
          amountMinor: payment.amountMinor,
          paymentMethod: payment.paymentMethod,
          sourceAccountId:
            payment.sourceType === "BOOK_ACCOUNT"
              ? payment.sourceAccountId
              : null,
          payerAssociateId:
            payment.sourceType === "ASSOCIATE_PERSONAL_FUNDS"
              ? payment.payerAssociateId
              : null,
        })),
      });

      await tx.economicAllocation.createMany({
        data: input.allocations.map((allocation) => ({
          operationId: operation.id,
          type: allocation.type,
          amountMinor: allocation.amountMinor,
          associateId:
            allocation.type === "ASSOCIATE_SPECIFIC"
              ? allocation.associateId
              : null,
        })),
      });

      if (input.documents.length > 0) {
        await tx.financialDocument.createMany({
          data: input.documents.map((document) => ({
            operationId: operation.id,
            type: document.type,
            documentNumber: document.documentNumber ?? null,
            issuedAt: document.issuedAt ? new Date(document.issuedAt) : null,
            supplierName: document.supplierName ?? null,
            supplierTaxId: document.supplierTaxId ?? null,
            storageKey: document.storageKey ?? null,
            notes: document.notes ?? null,
          })),
        });
      }

      await this.writeJournalEntry(tx, operation.id, input.postings, postedAt);

      await tx.financialOperation.update({
        where: { id: operation.id },
        data: { status: "POSTED", postedAt },
      });

      return operation.id;
    });
  }

  async createPostedAssociateFunding(
    input: CreatePostedAssociateFundingInput,
  ): Promise<string> {
    const postedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const operation = await tx.financialOperation.create({
        data: {
          bookId: input.bookId,
          kind: "ASSOCIATE_FUNDING",
          status: "DRAFT",
          occurredAt: input.occurredAt,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          createdById: input.createdById,
        },
        select: { id: true },
      });

      await tx.associateFunding.create({
        data: {
          operationId: operation.id,
          amountMinor: input.amountMinor,
          type: input.type,
          associateId: input.associateId,
          destinationAccountId: input.destinationAccountId,
          reference: input.reference,
          notes: input.notes,
        },
      });

      if (input.proof) {
        await tx.financialDocument.create({
          data: {
            operationId: operation.id,
            type: "RECEIPT",
            storageKey: input.proof.storageKey,
          },
        });

        const claimed = await tx.draftUpload.updateMany({
          where: { id: input.proof.draftUploadId, claimedAt: null },
          data: { claimedAt: postedAt },
        });
        if (claimed.count !== 1) {
          throw new Error("Funding proof draft upload was already used");
        }
      }

      await this.writeJournalEntry(tx, operation.id, input.postings, postedAt);
      await tx.financialOperation.update({
        where: { id: operation.id },
        data: { status: "POSTED", postedAt },
      });

      return operation.id;
    });
  }

  /**
   * Posts a REVERSAL and marks the original reversed, atomically.
   *
   * The original's rows are left exactly as they were — only its status
   * moves. The correction lives entirely in the new operation.
   */
  async createReversal(input: CreateReversalInput): Promise<string> {
    const postedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const reversal = await tx.financialOperation.create({
        data: {
          bookId: input.bookId,
          kind: "REVERSAL",
          status: "DRAFT",
          occurredAt: input.occurredAt,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          createdById: input.createdById,
          reversalOfOperationId: input.originalOperationId,
        },
        select: { id: true },
      });

      await this.writeJournalEntry(tx, reversal.id, input.postings, postedAt);

      await tx.financialOperation.update({
        where: { id: reversal.id },
        data: { status: "POSTED", postedAt },
      });

      // Guarded on status so two concurrent reversals cannot both succeed:
      // the second matches no row and the transaction rolls back.
      const marked = await tx.financialOperation.updateMany({
        where: { id: input.originalOperationId, status: "POSTED" },
        data: { status: "REVERSED" },
      });

      if (marked.count !== 1) {
        throw new ConcurrentReversalError(input.originalOperationId);
      }

      return reversal.id;
    });
  }

  private async writeJournalEntry(
    tx: Prisma.TransactionClient,
    operationId: string,
    postings: readonly PostingLine[],
    postedAt: Date,
  ): Promise<void> {
    const entry = await tx.journalEntry.create({
      data: { operationId, postedAt },
      select: { id: true },
    });

    await tx.journalPosting.createMany({
      data: postings.map((line, index) => ({
        journalEntryId: entry.id,
        accountId: line.accountId,
        lineNumber: index + 1,
        signedAmountMinor: line.signedAmountMinor,
        description: line.description,
      })),
    });
  }

  // -------------------------------------------------------------------------
  // Balances and settlement
  // -------------------------------------------------------------------------

  /**
   * Sums postings per account. Balances are never stored — a stored balance
   * is a second source of truth that will eventually disagree with the
   * postings that produced it.
   */
  async accountBalances(accountIds: string[]): Promise<AccountBalance[]> {
    if (accountIds.length === 0) return [];

    const grouped = await this.prisma.journalPosting.groupBy({
      by: ["accountId"],
      where: { accountId: { in: accountIds } },
      _sum: { signedAmountMinor: true },
      _count: { _all: true },
    });

    return grouped.map((row) => ({
      accountId: row.accountId,
      signedBalanceMinor: row._sum.signedAmountMinor ?? 0,
      postingCount: row._count._all,
    }));
  }

  /**
   * Specific-benefit allocations eligible for company-benefit settlement.
   *
   * Excludes, per the settlement rules: common allocations, capital assets,
   * anything not POSTED (which covers reversed operations, since reversing
   * moves the original to REVERSED), and operations a confirmed settlement
   * run has already accounted for.
   */
  async listSettleableSpecificBenefits(
    bookId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<SpecificBenefitRow[]> {
    const allocations = await this.prisma.economicAllocation.findMany({
      where: {
        type: "ASSOCIATE_SPECIFIC",
        operation: {
          bookId,
          kind: "EXPENSE",
          status: "POSTED",
          occurredAt: { gte: periodStart, lt: periodEnd },
          expense: {
            treatment: { in: [...v1.finance.SETTLED_EXPENSE_TREATMENTS] },
          },
          settlementRuns: {
            none: {
              settlementRun: {
                kind: "COMPANY_SPECIFIC_BENEFIT",
                status: { in: [...CLAIMED_SETTLEMENT_STATUSES] },
              },
            },
          },
        },
      },
      select: { operationId: true, associateId: true, amountMinor: true },
      orderBy: { createdAt: "asc" },
    });

    return allocations.flatMap((allocation) =>
      allocation.associateId
        ? [
            {
              operationId: allocation.operationId,
              associateId: allocation.associateId,
              amountMinor: allocation.amountMinor,
            },
          ]
        : [],
    );
  }
}

/** Raised when two reversals race and the second loses. */
export class ConcurrentReversalError extends Error {
  constructor(readonly operationId: string) {
    super("This operation was reversed by another request.");
    this.name = "ConcurrentReversalError";
  }
}
