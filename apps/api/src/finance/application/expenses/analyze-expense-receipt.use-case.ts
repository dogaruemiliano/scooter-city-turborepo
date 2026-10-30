import { Injectable, Logger } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type { ExpenseAnalysisResult } from "../../../document-extraction/document-extraction.types";
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
    const tokens =
      input.uploadTokens ?? (input.uploadToken ? [input.uploadToken] : []);
    if (
      !tokens.length ||
      tokens.length > v1.finance.EXPENSE_RECEIPT_MAX_FILES ||
      new Set(tokens).size !== tokens.length
    )
      throw new FinanceNotFoundError(
        "Choose one or two distinct receipt photos.",
      );
    const sources = await Promise.all(
      tokens.map(async (token) => {
        const stored = await this.imageStorage.completePresignedUpload(
          token,
          expenseReceiptUploadScope(ownerUserId),
        );
        const sourceUpload =
          await this.repository.findAvailableSourceUploadByFile({
            ownerUserId,
            provider: stored.provider,
            bucket: stored.bucket,
            storageKey: stored.storageKey,
            contentType: stored.contentType,
            byteSize: stored.byteSize,
            checksumSha256: stored.checksumSha256,
          });
        if (!sourceUpload)
          throw new FinanceNotFoundError(
            "That expense document upload is unavailable.",
          );
        return { stored, sourceUpload };
      }),
    );
    if (
      new Set(sources.map(({ sourceUpload }) => sourceUpload.id)).size !==
      sources.length
    )
      throw new FinanceNotFoundError("Choose distinct receipt photos.");
    const sourceUpload = sources[0].sourceUpload;

    const draft = await this.drafts.begin({
      ownerUserId,
      sourceUploadId: sourceUpload.id,
      ...(sources.length > 1
        ? {
            additionalSourceUploadIds: sources
              .slice(1)
              .map(({ sourceUpload }) => sourceUpload.id),
          }
        : {}),
      provider: this.documentExtraction.providerName,
    });
    if (!draft.shouldAnalyze) {
      return this.drafts.get(draft.draftId, ownerUserId);
    }

    try {
      const analyses = await Promise.all(
        sources.map(({ stored }) =>
          this.documentExtraction.analyzeExpense({
            source: {
              kind: "s3",
              bucket: stored.bucket,
              key: stored.storageKey,
            },
          }),
        ),
      );
      const analysis =
        analyses.length === 1 ? analyses[0] : mergeExpenseAnalyses(analyses);
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

/** Pages belong to one receipt; normalize page references before mapping its fields. */
export function mergeExpenseAnalyses(
  analyses: ExpenseAnalysisResult[],
): ExpenseAnalysisResult {
  let pageOffset = 0;
  let index = 0;
  const documents = analyses.flatMap((analysis) => {
    const offset = pageOffset;
    pageOffset += analysis.pages ?? 1;
    const field = (
      value: ExpenseAnalysisResult["documents"][number]["summaryFields"][number],
    ) => ({ ...value, pageNumber: (value.pageNumber ?? 1) + offset });
    return analysis.documents.map((document) => ({
      ...document,
      index: ++index,
      summaryFields: document.summaryFields.map(field),
      lineItemGroups: document.lineItemGroups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          fields: item.fields.map(field),
        })),
      })),
      textLines: document.textLines.map((line) => ({
        ...line,
        pageNumber: (line.pageNumber ?? 1) + offset,
      })),
    }));
  });
  return {
    provider: analyses[0].provider,
    providerRequestId:
      analyses
        .flatMap((value) =>
          value.providerRequestId ? [value.providerRequestId] : [],
        )
        .join(",") || undefined,
    pages: pageOffset,
    documents,
  };
}
