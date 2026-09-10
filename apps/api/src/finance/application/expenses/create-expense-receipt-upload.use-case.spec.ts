import { CreateExpenseReceiptUploadUseCase } from "./create-expense-receipt-upload.use-case";

describe("CreateExpenseReceiptUploadUseCase", () => {
  it("creates a user-scoped private receipt upload and persists its draft", async () => {
    const expiresAt = new Date("2026-08-22T12:05:00.000Z");
    const imageStorage = {
      createPresignedUpload: jest.fn().mockResolvedValue({
        provider: "s3",
        bucket: "private-documents",
        storageKey: "expense-invoice/receipt.jpg",
        uploadUrl: "https://uploads.example.test/receipt",
        uploadToken: "signed-token",
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        expiresAt,
        maxBytes: 5_000_000,
      }),
    };
    const prisma = { draftUpload: { create: jest.fn() } };
    const useCase = new CreateExpenseReceiptUploadUseCase(
      imageStorage as never,
      prisma as never,
    );
    const input = {
      contentType: "image/jpeg" as const,
      byteSize: 123,
      checksumSha256: "A".repeat(64),
    };

    await expect(useCase.execute(input, "user-1")).resolves.toMatchObject({
      uploadToken: "signed-token",
      method: "PUT",
      expiresAt: expiresAt.toISOString(),
    });
    expect(imageStorage.createPresignedUpload).toHaveBeenCalledWith({
      ...input,
      category: "expense-invoice",
      scope: "finance-expense-document:user-1",
    });
    expect(prisma.draftUpload.create).toHaveBeenCalledWith({
      data: {
        user: { connect: { id: "user-1" } },
        provider: "s3",
        bucket: "private-documents",
        storageKey: "expense-invoice/receipt.jpg",
        contentType: "image/jpeg",
        byteSize: 123,
        checksumSha256: "a".repeat(64),
        purpose: "finance-expense-document",
        expiresAt,
      },
    });
  });
});
