import { Injectable, Logger } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import { DocumentExtractionError } from "../../../document-extraction/document-extraction.errors";
import { DocumentExtractionService } from "../../../document-extraction/document-extraction.service";
import { ImageStorageService } from "../../../image-storage/image-storage.service";
import { FinanceNotFoundError } from "../../domain/finance.errors";
import { PrismaExpenseExtractionRepository } from "../../infrastructure/prisma-expense-extraction.repository";
import { ExpenseExtractionDraftService } from "./expense-extraction-draft.service";
import { expenseReceiptUploadScope } from "./create-expense-receipt-upload.use-case";

@Injectable()
export class AnalyzeExpenseReceiptUseCase {
  private readonly logger = new Logger(AnalyzeExpenseReceiptUseCase.name);

  constructor(
    private readonly imageStorage: ImageStorageService,
    private readonly documentExtraction: DocumentExtractionService,
    private readonly repository: PrismaExpenseExtractionRepository,
    private readonly drafts: ExpenseExtractionDraftService,
  ) {}

  async execute(
    input: v1.finance.AnalyzeExpenseReceiptInput,
    ownerUserId: string,
  ): Promise<v1.finance.ExpenseExtractionDraft> {
    const stored = await this.imageStorage.completePresignedUpload(
      input.uploadToken,
      expenseReceiptUploadScope(ownerUserId),
    );
    const sourceUpload = await this.repository.findAvailableSourceUploadByFile({
      ownerUserId,
      provider: stored.provider,
      bucket: stored.bucket,
      storageKey: stored.storageKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      checksumSha256: stored.checksumSha256,
    });

    if (!sourceUpload) {
      throw new FinanceNotFoundError(
        "That expense document upload is unavailable.",
      );
    }

    const draft = await this.drafts.begin({
      ownerUserId,
      sourceUploadId: sourceUpload.id,
      provider: this.documentExtraction.providerName,
    });
    if (!draft.shouldAnalyze) {
      return this.drafts.get(draft.draftId, ownerUserId);
    }

    try {
      const analysis = await this.documentExtraction.analyzeExpense({
        source: {
          kind: "s3",
          bucket: stored.bucket,
          key: stored.storageKey,
        },
      });
      return await this.drafts.complete({
        draftId: draft.draftId,
        ownerUserId,
        analysis,
      });
    } catch (error) {
      const failure = extractionFailure(error);
      if (!(error instanceof DocumentExtractionError)) {
        this.logger.error(
          "Expense receipt extraction failed with an unexpected error.",
        );
      }
      await this.drafts.fail({
        draftId: draft.draftId,
        ownerUserId,
        ...failure,
      });
      return this.drafts.get(draft.draftId, ownerUserId);
    }
  }
}

function extractionFailure(error: unknown): { code: string; message: string } {
  if (error instanceof DocumentExtractionError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "DOCUMENT_EXTRACTION_FAILED",
    message: "The receipt could not be analyzed.",
  };
}
