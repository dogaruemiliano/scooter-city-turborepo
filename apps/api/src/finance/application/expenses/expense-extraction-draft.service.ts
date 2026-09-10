import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import type { ExpenseAnalysisResult } from "../../../document-extraction/document-extraction.types";
import {
  FinanceNotFoundError,
  FinanceStateError,
} from "../../domain/finance.errors";
import { PrismaExpenseExtractionRepository } from "../../infrastructure/prisma-expense-extraction.repository";
import {
  EXPENSE_EXTRACTION_PARSER_VERSION,
  mapExpenseAnalysis,
} from "./map-expense-extraction";
import { EXPENSE_RECEIPT_DRAFT_PURPOSE } from "./create-expense-receipt-upload.use-case";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
export const EXPENSE_EXTRACTION_REVIEW_RETENTION_DAYS = 7;

export interface BeginExpenseExtractionResult {
  draftId: string;
  shouldAnalyze: boolean;
}

@Injectable()
export class ExpenseExtractionDraftService {
  constructor(private readonly repository: PrismaExpenseExtractionRepository) {}

  async begin(input: {
    ownerUserId: string;
    sourceUploadId: string;
    provider: string;
  }): Promise<BeginExpenseExtractionResult> {
    const availableAt = new Date();
    const retainUntil = new Date(
      availableAt.getTime() +
        EXPENSE_EXTRACTION_REVIEW_RETENTION_DAYS * MILLISECONDS_PER_DAY,
    );
    const draft = await this.repository.beginDraft({
      ...input,
      parserVersion: EXPENSE_EXTRACTION_PARSER_VERSION,
      sourceUploadPurpose: EXPENSE_RECEIPT_DRAFT_PURPOSE,
      availableAt,
      retainUntil,
    });
    if (!draft) {
      throw new FinanceNotFoundError(
        "That expense document upload is unavailable.",
      );
    }
    return {
      draftId: draft.draft.id,
      shouldAnalyze: draft.shouldAnalyze,
    };
  }

  async complete(input: {
    draftId: string;
    ownerUserId: string;
    analysis: ExpenseAnalysisResult;
  }): Promise<v1.finance.ExpenseExtractionDraft> {
    const identity = await this.repository.findCompanyIdentity();
    const result = mapExpenseAnalysis(input.analysis, identity);
    const updated = await this.repository.completeDraft(
      input.draftId,
      input.ownerUserId,
      {
        provider: input.analysis.provider,
        providerRequestId: input.analysis.providerRequestId ?? null,
        result,
      },
    );
    if (updated.count !== 1) {
      throw new FinanceStateError("That extraction draft cannot be completed.");
    }
    return this.get(input.draftId, input.ownerUserId);
  }

  async fail(input: {
    draftId: string;
    ownerUserId: string;
    code: string;
    message: string;
  }): Promise<void> {
    const updated = await this.repository.failDraft(
      input.draftId,
      input.ownerUserId,
      input,
    );
    if (updated.count !== 1) {
      throw new FinanceStateError("That extraction draft cannot be failed.");
    }
  }

  async get(
    draftId: string,
    ownerUserId: string,
  ): Promise<v1.finance.ExpenseExtractionDraft> {
    const draft = await this.repository.findDraftForOwner(draftId, ownerUserId);
    if (!draft) {
      throw new FinanceNotFoundError(
        "That expense extraction draft does not exist.",
      );
    }
    const result = draft.result
      ? v1.finance.normalizedExpenseExtractionSchema.parse(draft.result)
      : null;
    return {
      id: draft.id,
      sourceUploadId: draft.sourceUploadId,
      status: draft.status,
      provider: draft.provider,
      providerRequestId: draft.providerRequestId,
      parserVersion: draft.parserVersion,
      result,
      failureCode: draft.failureCode,
      failureMessage: draft.failureMessage,
      confirmedOperationId: draft.confirmedOperationId,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}
