import { Logger } from "@nestjs/common";

import {
  DRAFT_UPLOAD_CLEANUP_CLAIM_STALE_MINUTES,
  DraftUploadCleanupService,
} from "./draft-upload-cleanup.service";

const expiredDraft = {
  id: "upload-1",
  storageKey: "private/receipt.jpg",
};

function createFixture(input?: {
  cleanupClaimCount?: number;
  finalDeleteCount?: number;
  storageError?: Error;
  cleanupClaimError?: Error;
  finalizeError?: Error;
}) {
  const tx = {
    expenseExtractionDraft: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    draftUpload: {
      deleteMany: jest
        .fn()
        .mockResolvedValue({ count: input?.finalDeleteCount ?? 1 }),
    },
  };
  const prisma = {
    draftUpload: {
      findMany: jest.fn().mockResolvedValue([expiredDraft]),
      updateMany: input?.cleanupClaimError
        ? jest.fn().mockRejectedValue(input.cleanupClaimError)
        : jest.fn().mockResolvedValue({
            count: input?.cleanupClaimCount ?? 1,
          }),
    },
    $transaction: jest.fn(
      (operation: (client: typeof tx) => Promise<unknown>) => {
        if (input?.finalizeError) {
          return Promise.reject(input.finalizeError);
        }
        return operation(tx);
      },
    ),
  };
  const imageStorage = {
    deleteImage: input?.storageError
      ? jest.fn().mockRejectedValue(input.storageError)
      : jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new DraftUploadCleanupService(
      prisma as never,
      imageStorage as never,
    ),
    prisma,
    tx,
    imageStorage,
  };
}

describe("DraftUploadCleanupService", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-23T10:00:00.000Z"));
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
    jest.useRealTimers();
  });

  it("claims cleanup before S3 deletion and finalizes the database afterward", async () => {
    const { service, prisma, tx, imageStorage } = createFixture();

    await expect(service.runOnce()).resolves.toEqual({
      draftUploadsDeleted: 1,
      imagesDeleted: 1,
    });

    const expiredBefore = new Date("2026-08-23T10:00:00.000Z");
    const staleCleanupStartedBefore = new Date(
      expiredBefore.getTime() -
        DRAFT_UPLOAD_CLEANUP_CLAIM_STALE_MINUTES * 60 * 1_000,
    );
    const availableCleanupClaim = [
      { cleanupStartedAt: null },
      { cleanupStartedAt: { lt: staleCleanupStartedBefore } },
    ];
    expect(prisma.draftUpload.findMany).toHaveBeenCalledWith({
      where: {
        claimedAt: null,
        expiresAt: { lt: expiredBefore },
        OR: availableCleanupClaim,
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, storageKey: true },
    });
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledWith({
      where: {
        id: "upload-1",
        claimedAt: null,
        expiresAt: { lt: expiredBefore },
        OR: availableCleanupClaim,
      },
      data: { cleanupStartedAt: expiredBefore },
    });
    expect(imageStorage.deleteImage).toHaveBeenCalledWith(
      expiredDraft.storageKey,
    );
    expect(tx.expenseExtractionDraft.deleteMany).toHaveBeenCalledWith({
      where: {
        sourceUploadId: "upload-1",
        confirmedOperationId: null,
      },
    });
    expect(tx.draftUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "upload-1",
        claimedAt: null,
        cleanupStartedAt: expiredBefore,
        expenseExtractionDraft: { is: null },
      },
    });
    expect(
      prisma.draftUpload.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(imageStorage.deleteImage.mock.invocationCallOrder[0]);
    expect(imageStorage.deleteImage.mock.invocationCallOrder[0]).toBeLessThan(
      tx.expenseExtractionDraft.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it("does not touch S3 when an attachment claim wins the cleanup race", async () => {
    const { service, imageStorage } = createFixture({ cleanupClaimCount: 0 });

    await expect(service.runOnce()).resolves.toEqual({
      draftUploadsDeleted: 0,
      imagesDeleted: 0,
    });
    expect(imageStorage.deleteImage).not.toHaveBeenCalled();
  });

  it("leaves the cleanup timestamp for retry when S3 deletion fails", async () => {
    const { service, prisma, imageStorage } = createFixture({
      storageError: new Error("S3 unavailable"),
    });

    await expect(service.runOnce()).resolves.toEqual({
      draftUploadsDeleted: 0,
      imagesDeleted: 0,
    });
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          cleanupStartedAt: new Date("2026-08-23T10:00:00.000Z"),
        },
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(imageStorage.deleteImage).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("storage delete will retry draftUpload=upload-1"),
    );
  });

  it("keeps retry metadata when database finalization fails after S3 deletion", async () => {
    const { service, prisma, imageStorage } = createFixture({
      finalizeError: new Error("database unavailable"),
    });

    await expect(service.runOnce()).resolves.toEqual({
      draftUploadsDeleted: 0,
      imagesDeleted: 1,
    });
    expect(imageStorage.deleteImage).toHaveBeenCalled();
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "database finalize will retry draftUpload=upload-1",
      ),
    );
  });

  it("rolls back finalization if this worker loses its cleanup ownership", async () => {
    const { service, imageStorage, tx } = createFixture({
      finalDeleteCount: 0,
    });

    await expect(service.runOnce()).resolves.toEqual({
      draftUploadsDeleted: 0,
      imagesDeleted: 1,
    });
    expect(imageStorage.deleteImage).toHaveBeenCalled();
    expect(tx.draftUpload.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "upload-1",
        claimedAt: null,
        cleanupStartedAt: new Date("2026-08-23T10:00:00.000Z"),
        expenseExtractionDraft: { is: null },
      },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "database finalize will retry draftUpload=upload-1",
      ),
    );
  });

  it("leaves storage intact when cleanup ownership cannot be acquired", async () => {
    const { service, imageStorage } = createFixture({
      cleanupClaimError: new Error("transaction conflict"),
    });

    await expect(service.runOnce()).resolves.toEqual({
      draftUploadsDeleted: 0,
      imagesDeleted: 0,
    });
    expect(imageStorage.deleteImage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to acquire draftUpload=upload-1"),
    );
  });
});
