import { Prisma } from "../../generated/prisma/client";
import { PrismaExpenseExtractionRepository } from "./prisma-expense-extraction.repository";

describe("PrismaExpenseExtractionRepository", () => {
  it("retains both receipt photos before starting analysis", async () => {
    const tx = {
      draftUpload: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      expenseExtractionDraft: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: "draft" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const repository = new PrismaExpenseExtractionRepository(prisma as never);
    const availableAt = new Date(),
      retainUntil = new Date(availableAt.getTime() + 7 * 86_400_000);
    await repository.beginDraft({
      ownerUserId: "owner",
      sourceUploadId: "first",
      additionalSourceUploadIds: ["second"],
      provider: "fake",
      parserVersion: "v1",
      sourceUploadPurpose: "finance-expense-document",
      availableAt,
      retainUntil,
    });
    expect(tx.draftUpload.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["first", "second"] },
        }) as unknown,
        data: { expiresAt: retainUntil },
      }),
    );
    expect(tx.expenseExtractionDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          additionalSourceUploadIds: ["second"],
        }) as unknown,
      }),
    );
  });

  it("does not reuse an analysis with a different second source photo", async () => {
    const tx = {
      draftUpload: { updateMany: jest.fn() },
      expenseExtractionDraft: {
        findUnique: jest.fn().mockResolvedValue({
          ownerUserId: "owner",
          status: "READY",
          additionalSourceUploadIds: ["old-second"],
        }),
        upsert: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const repository = new PrismaExpenseExtractionRepository(prisma as never);
    await expect(
      repository.beginDraft({
        ownerUserId: "owner",
        sourceUploadId: "first",
        additionalSourceUploadIds: ["new-second"],
        provider: "fake",
        parserVersion: "v1",
        sourceUploadPurpose: "finance-expense-document",
        availableAt: new Date(),
        retainUntil: new Date(),
      }),
    ).resolves.toBeNull();
    expect(tx.expenseExtractionDraft.upsert).not.toHaveBeenCalled();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not resolve an uploaded object already claimed for cleanup", async () => {
    const availableAt = new Date("2026-08-23T10:00:00.000Z");
    jest.useFakeTimers().setSystemTime(availableAt);
    const prisma = {
      draftUpload: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const repository = new PrismaExpenseExtractionRepository(prisma as never);

    await repository.findAvailableSourceUploadByFile({
      ownerUserId: "user-1",
      provider: "s3",
      bucket: "private-documents",
      storageKey: "receipts/receipt.jpg",
      contentType: "image/jpeg",
      byteSize: 1_024,
      checksumSha256: "a".repeat(64),
    });

    expect(prisma.draftUpload.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        provider: "s3",
        bucket: "private-documents",
        storageKey: "receipts/receipt.jpg",
        contentType: "image/jpeg",
        byteSize: 1_024,
        checksumSha256: "a".repeat(64),
        purpose: "finance-expense-document",
        claimedAt: null,
        cleanupStartedAt: null,
        expiresAt: { gt: availableAt },
      },
      select: { id: true },
    });
  });

  it("atomically retains an available upload before starting its extraction draft", async () => {
    const availableAt = new Date("2026-08-23T10:00:00.000Z");
    const retainUntil = new Date("2026-08-30T10:00:00.000Z");
    const draft = { id: "draft-1", ownerUserId: "user-1" };
    const tx = {
      draftUpload: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      expenseExtractionDraft: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(draft),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    };
    const repository = new PrismaExpenseExtractionRepository(prisma as never);

    await expect(
      repository.beginDraft({
        ownerUserId: "user-1",
        sourceUploadId: "upload-1",
        provider: "aws-textract",
        parserVersion: "expense-v5",
        sourceUploadPurpose: "finance-expense-document",
        availableAt,
        retainUntil,
      }),
    ).resolves.toEqual({ draft, shouldAnalyze: true });

    expect(tx.draftUpload.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["upload-1"] },
        userId: "user-1",
        purpose: "finance-expense-document",
        claimedAt: null,
        cleanupStartedAt: null,
        expiresAt: { gt: availableAt },
      },
      data: { expiresAt: retainUntil },
    });
    expect(tx.expenseExtractionDraft.upsert).toHaveBeenCalledWith({
      where: { sourceUploadId: "upload-1" },
      create: {
        ownerUserId: "user-1",
        sourceUploadId: "upload-1",
        additionalSourceUploadIds: [],
        provider: "aws-textract",
        parserVersion: "expense-v5",
        status: "ANALYZING",
      },
      update: {
        status: "ANALYZING",
        provider: "aws-textract",
        parserVersion: "expense-v5",
        providerRequestId: null,
        result: Prisma.DbNull,
        failureCode: null,
        failureMessage: null,
      },
    });
    expect(tx.draftUpload.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.expenseExtractionDraft.upsert.mock.invocationCallOrder[0],
    );
  });

  it("does not create a draft when the upload cannot be atomically retained", async () => {
    const tx = {
      draftUpload: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      expenseExtractionDraft: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    };
    const repository = new PrismaExpenseExtractionRepository(prisma as never);

    await expect(
      repository.beginDraft({
        ownerUserId: "user-1",
        sourceUploadId: "upload-1",
        provider: "aws-textract",
        parserVersion: "expense-v5",
        sourceUploadPurpose: "finance-expense-document",
        availableAt: new Date("2026-08-23T10:00:00.000Z"),
        retainUntil: new Date("2026-08-30T10:00:00.000Z"),
      }),
    ).resolves.toBeNull();
    expect(tx.expenseExtractionDraft.upsert).not.toHaveBeenCalled();
  });

  it("reuses an owned READY draft without resetting the stored result", async () => {
    const readyDraft = {
      id: "draft-1",
      ownerUserId: "user-1",
      status: "READY",
      result: { total: { amountMinor: 2_500 } },
    };
    const tx = {
      draftUpload: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      expenseExtractionDraft: {
        findUnique: jest.fn().mockResolvedValue(readyDraft),
        upsert: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    };
    const repository = new PrismaExpenseExtractionRepository(prisma as never);

    await expect(
      repository.beginDraft({
        ownerUserId: "user-1",
        sourceUploadId: "upload-1",
        provider: "aws-textract",
        parserVersion: "expense-v5",
        sourceUploadPurpose: "finance-expense-document",
        availableAt: new Date("2026-08-23T10:00:00.000Z"),
        retainUntil: new Date("2026-08-30T10:00:00.000Z"),
      }),
    ).resolves.toEqual({ draft: readyDraft, shouldAnalyze: false });
    expect(tx.expenseExtractionDraft.upsert).not.toHaveBeenCalled();
  });
});
