import { FinanceNotFoundError } from "../../domain/finance.errors";
import { EXPENSE_EXTRACTION_PARSER_VERSION } from "./map-expense-extraction";
import { EXPENSE_RECEIPT_DRAFT_PURPOSE } from "./create-expense-receipt-upload.use-case";
import {
  EXPENSE_EXTRACTION_REVIEW_RETENTION_DAYS,
  ExpenseExtractionDraftService,
} from "./expense-extraction-draft.service";

describe("ExpenseExtractionDraftService", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("extends a verified receipt upload for the seven-day review window", async () => {
    const availableAt = new Date("2026-08-23T10:00:00.000Z");
    jest.useFakeTimers().setSystemTime(availableAt);
    const repository = {
      beginDraft: jest.fn().mockResolvedValue({
        draft: { id: "draft-1" },
        shouldAnalyze: true,
      }),
    };
    const service = new ExpenseExtractionDraftService(repository as never);

    await expect(
      service.begin({
        ownerUserId: "user-1",
        sourceUploadId: "upload-1",
        provider: "aws-textract",
      }),
    ).resolves.toEqual({ draftId: "draft-1", shouldAnalyze: true });

    expect(repository.beginDraft).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      sourceUploadId: "upload-1",
      provider: "aws-textract",
      parserVersion: EXPENSE_EXTRACTION_PARSER_VERSION,
      sourceUploadPurpose: EXPENSE_RECEIPT_DRAFT_PURPOSE,
      availableAt,
      retainUntil: new Date(
        availableAt.getTime() +
          EXPENSE_EXTRACTION_REVIEW_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ),
    });
  });

  it("rejects an upload that loses the owner, purpose, expiry, or claim race", async () => {
    const repository = {
      beginDraft: jest.fn().mockResolvedValue(null),
    };
    const service = new ExpenseExtractionDraftService(repository as never);

    await expect(
      service.begin({
        ownerUserId: "user-1",
        sourceUploadId: "upload-1",
        provider: "aws-textract",
      }),
    ).rejects.toBeInstanceOf(FinanceNotFoundError);
  });
});
