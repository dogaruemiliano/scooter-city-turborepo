import { DocumentExtractionError } from "../../../document-extraction/document-extraction.errors";
import type { ExpenseAnalysisResult } from "../../../document-extraction/document-extraction.types";
import {
  AnalyzeExpenseReceiptUseCase,
  mergeExpenseAnalyses,
} from "./analyze-expense-receipt.use-case";

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
  it("analyzes two verified uploads into one draft with both sources retained", async () => {
    const imageStorage = {
      completePresignedUpload: jest
        .fn()
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce({
          ...stored,
          storageKey: "expense-invoice/page2.jpg",
        }),
    };
    const extraction = {
      providerName: "fake",
      analyzeExpense: jest.fn().mockResolvedValue(analysis),
    };
    const repository = {
      findAvailableSourceUploadByFile: jest
        .fn()
        .mockResolvedValueOnce({ id: "upload-1" })
        .mockResolvedValueOnce({ id: "upload-2" }),
    };
    const drafts = {
      begin: jest
        .fn()
        .mockResolvedValue({ draftId: "draft-1", shouldAnalyze: true }),
      complete: jest.fn().mockResolvedValue({ id: "draft-1", status: "READY" }),
      fail: jest.fn(),
    };
    const useCase = new AnalyzeExpenseReceiptUseCase(
      imageStorage as never,
      extraction as never,
      repository as never,
      drafts as never,
    );
    await useCase.execute({ uploadTokens: ["one", "two"] }, "user-1");
    expect(drafts.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUploadId: "upload-1",
        additionalSourceUploadIds: ["upload-2"],
      }),
    );
    expect(extraction.analyzeExpense).toHaveBeenCalledTimes(2);
    expect(drafts.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis: expect.objectContaining({ pages: 2 }) as unknown,
      }),
    );
  });

  it("normalizes page references across the two receipt photos", () => {
    const page = {
      ...analysis,
      documents: [
        {
          summaryFields: [
            { value: { text: "25.00" }, pageNumber: 1, groups: [] },
          ],
          lineItemGroups: [],
          textLines: [{ text: "Receipt", pageNumber: 1 }],
        },
      ],
    };
    const merged = mergeExpenseAnalyses([page, page]);
    expect(merged.pages).toBe(2);
    expect(
      merged.documents.map((document) => document.summaryFields[0]?.pageNumber),
    ).toEqual([1, 2]);
    expect(
      merged.documents.map((document) => document.textLines[0]?.pageNumber),
    ).toEqual([1, 2]);
  });

  it("rejects two tokens referring to the same source upload", async () => {
    const imageStorage = {
      completePresignedUpload: jest.fn().mockResolvedValue(stored),
    };
    const extraction = { providerName: "fake", analyzeExpense: jest.fn() };
    const repository = {
      findAvailableSourceUploadByFile: jest
        .fn()
        .mockResolvedValue({ id: "same" }),
    };
    const drafts = { begin: jest.fn() };
    const useCase = new AnalyzeExpenseReceiptUseCase(
      imageStorage as never,
      extraction as never,
      repository as never,
      drafts as never,
    );
    await expect(
      useCase.execute({ uploadTokens: ["one", "two"] }, "user-1"),
    ).rejects.toThrow("distinct receipt photos");
    expect(drafts.begin).not.toHaveBeenCalled();
    expect(extraction.analyzeExpense).not.toHaveBeenCalled();
  });

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
