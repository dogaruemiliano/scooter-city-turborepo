/**
 * Records an expense and posts it to the ledger.
 *
 * Order of operations matters:
 *
 * 1. Check the idempotency key first, so a retry costs one read.
 * 2. Validate references and build the posting plan — everything that can
 *    fail, fails here, outside any transaction.
 * 3. Assert the entry balances.
 * 4. Write everything in one transaction and flip the operation to POSTED.
 *
 * Nothing slow happens inside the transaction: no account resolution, no
 * document handling, no external calls.
 */
import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { ImageStorageService } from "../../../image-storage/image-storage.service";
import {
  FinanceNotFoundError,
  FinanceStateError,
  FinanceValidationError,
  IdempotencyConflictError,
} from "../../domain/finance.errors";
import { assertTreatmentAllowedForBook } from "../../domain/finance-invariants";
import { JournalValidator } from "../../domain/journal-validator";
import { ExpensePostingPolicy } from "../../domain/policies/expense-posting.policy";
import { toFinancialOperation } from "../../finance.mapper";
import { PrismaFinanceRepository } from "../../infrastructure/prisma-finance.repository";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  fingerprintExpenseInput,
  fingerprintStoredExpense,
  toExpenseCommand,
} from "./expense-command";
import {
  EXPENSE_RECEIPT_DRAFT_PURPOSE,
  expenseReceiptUploadScope,
} from "./create-expense-receipt-upload.use-case";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

export interface CreateExpenseRequest {
  input: v1.finance.CreateExpenseInput;
  idempotencyKey: string;
  createdById: string;
}

@Injectable()
export class CreateExpenseUseCase {
  constructor(
    private readonly policy: ExpensePostingPolicy,
    private readonly journal: JournalValidator,
    private readonly repository: PrismaFinanceRepository,
    private readonly prisma: PrismaService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  async execute({
    input,
    idempotencyKey,
    createdById,
  }: CreateExpenseRequest): Promise<v1.finance.FinancialOperation> {
    const replay = await this.resolveReplay(input, idempotencyKey);
    if (replay) return replay;

    await this.assertReferencesExist(input);
    const receiptAttachment = input.extractionDraftId
      ? await this.prepareExtractionAttachment(
          input.extractionDraftId,
          createdById,
        )
      : input.receiptUploadToken
        ? await this.prepareDirectAttachment(
            input.receiptUploadToken,
            createdById,
          )
        : null;

    const command = toExpenseCommand(input);
    const plan = await this.policy.build(command);
    this.journal.assertBalanced(plan.postings);

    let operationId: string;

    try {
      operationId = await this.repository.createPostedExpense({
        bookId: input.bookId,
        occurredAt: new Date(input.occurredAt),
        description: input.description ?? null,
        idempotencyKey,
        createdById,
        amountMinor: input.amountMinor,
        treatment: input.treatment,
        categoryId: input.categoryId,
        costObjectId: input.costObjectId ?? null,
        supplierId: input.supplierId ?? null,
        payments: command.payments,
        allocations: command.allocations,
        documents: input.documents ?? [],
        receiptAttachment,
        postings: plan.postings,
      });
    } catch (error) {
      // Two identical requests raced past the replay check. The unique index
      // on (bookId, idempotencyKey) is what actually guarantees one write;
      // the loser returns the winner's operation.
      const raced = await this.resolveRaceWinner(error, input, idempotencyKey);
      if (raced) return raced;
      throw error;
    }

    return this.loadOperation(operationId);
  }

  private async prepareExtractionAttachment(
    draftId: string,
    ownerUserId: string,
  ): Promise<{
    source: "EXTRACTION_DRAFT";
    extractionDraftId: string;
    draftUploadId: string;
    storageKey: string;
  }> {
    const draft = await this.prisma.expenseExtractionDraft.findFirst({
      where: { id: draftId, ownerUserId },
      select: {
        id: true,
        sourceUploadId: true,
        status: true,
        confirmedOperationId: true,
        sourceUpload: {
          select: {
            storageKey: true,
            purpose: true,
            claimedAt: true,
            cleanupStartedAt: true,
          },
        },
      },
    });

    if (!draft) {
      throw new FinanceNotFoundError(
        "That receipt extraction draft does not exist.",
        { draftId },
      );
    }

    if (
      draft.status !== "READY" ||
      draft.confirmedOperationId ||
      draft.sourceUpload.claimedAt ||
      draft.sourceUpload.cleanupStartedAt !== null ||
      draft.sourceUpload.purpose !== "finance-expense-document"
    ) {
      throw new FinanceStateError(
        "That receipt has already been used or is not ready to confirm.",
        { draftId },
      );
    }

    return {
      source: "EXTRACTION_DRAFT",
      extractionDraftId: draft.id,
      draftUploadId: draft.sourceUploadId,
      storageKey: draft.sourceUpload.storageKey,
    };
  }

  private async prepareDirectAttachment(
    uploadToken: string,
    ownerUserId: string,
  ): Promise<{
    source: "DIRECT_UPLOAD";
    draftUploadId: string;
    storageKey: string;
  }> {
    const stored = await this.imageStorage.completePresignedUpload(
      uploadToken,
      expenseReceiptUploadScope(ownerUserId),
    );
    const draft = await this.prisma.draftUpload.findUnique({
      where: { storageKey: stored.storageKey },
      select: {
        id: true,
        userId: true,
        provider: true,
        bucket: true,
        storageKey: true,
        contentType: true,
        byteSize: true,
        checksumSha256: true,
        purpose: true,
        expiresAt: true,
        claimedAt: true,
        cleanupStartedAt: true,
      },
    });

    if (
      !draft ||
      draft.userId !== ownerUserId ||
      draft.purpose !== EXPENSE_RECEIPT_DRAFT_PURPOSE ||
      draft.provider !== stored.provider ||
      draft.bucket !== stored.bucket ||
      draft.storageKey !== stored.storageKey ||
      draft.contentType !== stored.contentType ||
      draft.byteSize !== stored.byteSize ||
      draft.checksumSha256 !== stored.checksumSha256 ||
      draft.claimedAt !== null ||
      draft.cleanupStartedAt !== null ||
      draft.expiresAt <= new Date()
    ) {
      throw new FinanceValidationError(
        "The receipt upload is expired, already used, or does not match.",
      );
    }

    return {
      source: "DIRECT_UPLOAD",
      draftUploadId: draft.id,
      storageKey: draft.storageKey,
    };
  }

  /** Returns the original operation when this key has already been used. */
  private async resolveReplay(
    input: v1.finance.CreateExpenseInput,
    idempotencyKey: string,
  ): Promise<v1.finance.FinancialOperation | null> {
    const existing = await this.repository.findOperationByIdempotencyKey(
      input.bookId,
      idempotencyKey,
    );

    if (!existing) return null;

    if (fingerprintStoredExpense(existing) !== fingerprintExpenseInput(input)) {
      throw new IdempotencyConflictError(
        "This idempotency key was already used for a different expense. Use a new key.",
        { idempotencyKey, operationId: existing.id },
      );
    }

    return toFinancialOperation(existing);
  }

  private async resolveRaceWinner(
    error: unknown,
    input: v1.finance.CreateExpenseInput,
    idempotencyKey: string,
  ): Promise<v1.finance.FinancialOperation | null> {
    const isDuplicateKey =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION;

    return isDuplicateKey ? this.resolveReplay(input, idempotencyKey) : null;
  }

  /**
   * Category and cost object must belong to the same book as the expense.
   * Prisma's foreign keys prove they exist; only this proves they belong.
   */
  private async assertReferencesExist(
    input: v1.finance.CreateExpenseInput,
  ): Promise<void> {
    const [book, category, costObject, supplier] = await Promise.all([
      this.repository.findBookById(input.bookId),
      this.prisma.expenseCategory.findUnique({
        where: { id: input.categoryId },
        select: { bookId: true, isActive: true, name: true },
      }),
      input.costObjectId
        ? this.prisma.costObject.findUnique({
            where: { id: input.costObjectId },
            select: { bookId: true, isActive: true, name: true },
          })
        : Promise.resolve(null),
      input.supplierId
        ? this.repository.findSupplierById(input.supplierId)
        : Promise.resolve(null),
    ]);

    if (!book) {
      throw new FinanceNotFoundError("That finance book does not exist.", {
        bookId: input.bookId,
      });
    }

    assertTreatmentAllowedForBook(input.treatment, book.type);

    if (!category || category.bookId !== input.bookId) {
      throw new FinanceNotFoundError(
        "That expense category does not exist in this finance book.",
        { categoryId: input.categoryId },
      );
    }

    if (!category.isActive) {
      throw new FinanceNotFoundError(
        `The category "${category.name}" is archived and cannot take new expenses.`,
        { categoryId: input.categoryId },
      );
    }

    if (input.costObjectId) {
      if (!costObject || costObject.bookId !== input.bookId) {
        throw new FinanceNotFoundError(
          "That cost object does not exist in this finance book.",
          { costObjectId: input.costObjectId },
        );
      }

      if (!costObject.isActive) {
        throw new FinanceNotFoundError(
          `The cost object "${costObject.name}" is archived and cannot take new expenses.`,
          { costObjectId: input.costObjectId },
        );
      }
    }

    if (input.supplierId) {
      if (!supplier) {
        throw new FinanceNotFoundError("That supplier does not exist.", {
          supplierId: input.supplierId,
        });
      }

      if (!supplier.isActive) {
        throw new FinanceNotFoundError(
          `The supplier "${supplier.name}" is archived and cannot take new expenses.`,
          { supplierId: input.supplierId },
        );
      }
    }
  }

  private async loadOperation(
    operationId: string,
  ): Promise<v1.finance.FinancialOperation> {
    const row = await this.repository.findOperationById(operationId);

    if (!row) {
      throw new FinanceNotFoundError(
        "The expense was saved but could not be read back.",
        { operationId },
      );
    }

    return toFinancialOperation(row);
  }
}
