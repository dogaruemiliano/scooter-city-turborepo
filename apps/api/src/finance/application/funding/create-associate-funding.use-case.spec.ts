import { FinanceValidationError } from "../../domain/finance.errors";
import { CreateAssociateFundingUseCase } from "./create-associate-funding.use-case";

describe("CreateAssociateFundingUseCase proof lifecycle", () => {
  it("rejects a proof upload already claimed for cleanup", async () => {
    const stored = {
      provider: "s3",
      bucket: "private-documents",
      storageKey: "funding/proof.jpg",
      contentType: "image/jpeg",
      byteSize: 1_024,
      checksumSha256: "a".repeat(64),
    };
    const repository = {
      findOperationByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findBookById: jest.fn().mockResolvedValue({
        type: "COMPANY",
        members: [{ associateId: "user-1" }],
      }),
      createPostedAssociateFunding: jest.fn(),
    };
    const prisma = {
      draftUpload: {
        findUnique: jest.fn().mockResolvedValue({
          id: "upload-1",
          userId: "user-1",
          purpose: "finance-funding-proof",
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          claimedAt: null,
          cleanupStartedAt: new Date("2026-08-23T10:00:00.000Z"),
          ...stored,
        }),
      },
    };
    const imageStorage = {
      completePresignedUpload: jest.fn().mockResolvedValue(stored),
    };
    const useCase = new CreateAssociateFundingUseCase(
      { build: jest.fn() } as never,
      { assertBalanced: jest.fn() } as never,
      repository as never,
      prisma as never,
      imageStorage as never,
    );

    await expect(
      useCase.execute({
        input: {
          bookId: "company-book",
          occurredAt: "2026-08-23T10:00:00.000Z",
          amountMinor: 5_000,
          type: "LOAN",
          associateId: "user-1",
          destinationAccountId: "bank-account",
          proofUploadToken: "signed-token",
        },
        idempotencyKey: "funding-cleanup-race",
        createdById: "user-1",
      }),
    ).rejects.toBeInstanceOf(FinanceValidationError);
    expect(repository.createPostedAssociateFunding).not.toHaveBeenCalled();
  });
});
