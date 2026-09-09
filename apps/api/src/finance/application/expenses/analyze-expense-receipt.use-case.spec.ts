import { DocumentExtractionError } from "../../../document-extraction/document-extraction.errors";
import type { ExpenseAnalysisResult } from "../../../document-extraction/document-extraction.types";
import { AnalyzeExpenseReceiptUseCase } from "./analyze-expense-receipt.use-case";

const stored = {
  provider: "s3" as const,
  bucket: "private-documents",
  storageKey: "expense-invoice/receipt.jpg",
  contentType: "image/jpeg" as const,
  byteSize: 123,
  checksumSha256: "a".repeat(64),
};

const analysis: ExpenseAnalysisResult = {
  provider: "fake",
  providerRequestId: "request-1",
  pages: 1,
  documents: [],
};

describe("AnalyzeExpenseReceiptUseCase", () => {
  it("verifies the upload and analyzes its private S3 object", async () => {
    const imageStorage = {
      completePresignedUpload: jest.fn().mockResolvedValue(stored),
    };
    const documentExtraction = {
      providerName: "fake",
      analyzeExpense: jest.fn().mockResolvedValue(analysis),
    };
    const repository = {
      findAvailableSourceUploadByFile: jest
        .fn()
        .mockResolvedValue({ id: "upload-1" }),
    };
    const completedDraft = { id: "draft-1", status: "READY" };
    const drafts = {
      begin: jest
        .fn()
        .mockResolvedValue({ draftId: "draft-1", shouldAnalyze: true }),
      complete: jest.fn().mockResolvedValue(completedDraft),
      fail: jest.fn(),
      get: jest.fn(),
    };
    const useCase = new AnalyzeExpenseReceiptUseCase(
      imageStorage as never,
      documentExtraction as never,
      repository as never,
      drafts as never,
    );

    await expect(
      useCase.execute({ uploadToken: "signed-token" }, "user-1"),
    ).resolves.toBe(completedDraft);
    expect(imageStorage.completePresignedUpload).toHaveBeenCalledWith(
      "signed-token",
      "finance-expense-document:user-1",
    );
    expect(documentExtraction.analyzeExpense).toHaveBeenCalledWith({
      source: {
        kind: "s3",
        bucket: stored.bucket,
        key: stored.storageKey,
      },
    });
    expect(drafts.complete).toHaveBeenCalledWith({
      draftId: "draft-1",
      ownerUserId: "user-1",
      analysis,
    });
  });

  it("persists a safe failed draft when extraction rejects the receipt", async () => {
    const failure = new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
      "Textract could not read the document.",
      false,
    );
    const imageStorage = {
      completePresignedUpload: jest.fn().mockResolvedValue(stored),
    };
    const documentExtraction = {
      providerName: "aws-textract",
      analyzeExpense: jest.fn().mockRejectedValue(failure),
    };
    const repository = {
      findAvailableSourceUploadByFile: jest
        .fn()
        .mockResolvedValue({ id: "upload-1" }),
    };
    const failedDraft = { id: "draft-1", status: "FAILED" };
    const drafts = {
      begin: jest
        .fn()
        .mockResolvedValue({ draftId: "draft-1", shouldAnalyze: true }),
      complete: jest.fn(),
      fail: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(failedDraft),
    };
    const useCase = new AnalyzeExpenseReceiptUseCase(
      imageStorage as never,
      documentExtraction as never,
      repository as never,
      drafts as never,
    );

    await expect(
      useCase.execute({ uploadToken: "signed-token" }, "user-1"),
    ).resolves.toBe(failedDraft);
    expect(drafts.fail).toHaveBeenCalledWith({
      draftId: "draft-1",
      ownerUserId: "user-1",
      code: "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
      message: "Textract could not read the document.",
    });
  });

  it("returns an existing READY draft without invoking Textract again", async () => {
    const imageStorage = {
      completePresignedUpload: jest.fn().mockResolvedValue(stored),
    };
    const documentExtraction = {
      providerName: "aws-textract",
      analyzeExpense: jest.fn(),
    };
    const repository = {
      findAvailableSourceUploadByFile: jest
        .fn()
        .mockResolvedValue({ id: "upload-1" }),
    };
    const readyDraft = { id: "draft-1", status: "READY" };
    const drafts = {
      begin: jest
        .fn()
        .mockResolvedValue({ draftId: "draft-1", shouldAnalyze: false }),
      complete: jest.fn(),
      fail: jest.fn(),
      get: jest.fn().mockResolvedValue(readyDraft),
    };
    const useCase = new AnalyzeExpenseReceiptUseCase(
      imageStorage as never,
      documentExtraction as never,
      repository as never,
      drafts as never,
    );

    await expect(
      useCase.execute({ uploadToken: "signed-token" }, "user-1"),
    ).resolves.toBe(readyDraft);
    expect(drafts.get).toHaveBeenCalledWith("draft-1", "user-1");
    expect(documentExtraction.analyzeExpense).not.toHaveBeenCalled();
    expect(drafts.complete).not.toHaveBeenCalled();
    expect(drafts.fail).not.toHaveBeenCalled();
  });
});
