import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ScooterPhotosService } from "./scooter-photos.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { Prisma } from "../generated/prisma/client";

describe("ScooterPhotosService", () => {
  const photo = {
    id: "photo-1",
    position: 0,
    showToCustomers: false,
    internalCover: true,
    customerCover: false,
  };
  const stored = {
    provider: "s3",
    bucket: "private",
    storageKey: "scooter-photos/key",
    contentType: "image/jpeg",
    byteSize: 100,
    checksumSha256: "a".repeat(64),
  };
  const prisma = {
    scooter: { findFirst: jest.fn(), updateMany: jest.fn() },
    scooterPhoto: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    draftUpload: { create: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const storage = {
    completePresignedUpload: jest.fn(),
    createPresignedUpload: jest.fn(),
    readImage: jest.fn(),
  };
  const service = new ScooterPhotosService(
    prisma as unknown as PrismaService,
    storage as unknown as ImageStorageService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        run(prisma as unknown as Prisma.TransactionClient),
    );
    prisma.scooter.findFirst.mockResolvedValue({ id: "scooter-1" });
    prisma.scooter.updateMany.mockResolvedValue({ count: 1 });
    prisma.scooterPhoto.findFirst.mockResolvedValue(photo);
    prisma.scooterPhoto.findMany.mockResolvedValue([]);
    prisma.draftUpload.updateMany.mockResolvedValue({ count: 1 });
    storage.completePresignedUpload.mockResolvedValue(stored);
  });

  it("claims private creation uploads for their owner and preserves gallery settings", async () => {
    const drafts = [
      {
        uploadToken: "token",
        fileName: "front.jpg",
        caption: "Front view",
        showToCustomers: true,
        internalCover: true,
        customerCover: true,
      },
    ];
    const prepared = await service.prepareDrafts(drafts, "user-1");
    expect(storage.completePresignedUpload).toHaveBeenCalledWith(
      "token",
      "scooter-photo-draft:user-1",
    );
    await service.applyDrafts(
      prisma as unknown as Prisma.TransactionClient,
      "new-scooter",
      prepared,
      "user-1",
    );
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          purpose: "scooter-photo-draft",
          claimedAt: null,
          cleanupStartedAt: null,
        }),
      }),
    );
    expect(prisma.scooterPhoto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caption: "Front view",
        customerCover: true,
        position: 0,
        scooter: { connect: { id: "new-scooter" } },
      }),
    });
  });

  it("rejects expired or already claimed creation uploads", async () => {
    const prepared = await service.prepareDrafts(
      [
        {
          uploadToken: "token",
          fileName: "front.jpg",
          caption: null,
          showToCustomers: false,
          internalCover: false,
          customerCover: false,
        },
      ],
      "user-1",
    );
    prisma.draftUpload.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.applyDrafts(
        prisma as unknown as Prisma.TransactionClient,
        "new-scooter",
        prepared,
        "user-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scooterPhoto.create).not.toHaveBeenCalled();
  });

  it("rejects an internal photo as a customer cover", async () => {
    await expect(
      service.update("scooter-1", "photo-1", { customerCover: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scooterPhoto.update).not.toHaveBeenCalled();
  });

  it("clears the customer cover when a photo becomes internal", async () => {
    prisma.scooterPhoto.findFirst.mockResolvedValue({
      ...photo,
      showToCustomers: true,
      customerCover: true,
    });
    await service.update("scooter-1", "photo-1", { showToCustomers: false });
    expect(prisma.scooterPhoto.update).toHaveBeenCalledWith({
      where: { id: "photo-1" },
      data: { showToCustomers: false, customerCover: false },
    });
  });

  it("clears the previous cover before assigning a new one", async () => {
    await service.update("scooter-1", "photo-1", {
      internalCover: true,
      showToCustomers: true,
      customerCover: true,
    });
    expect(prisma.scooterPhoto.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.scooter.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.scooterPhoto.updateMany.mock.invocationCallOrder[0],
    );
    expect(
      prisma.scooterPhoto.updateMany.mock.invocationCallOrder[1],
    ).toBeLessThan(prisma.scooterPhoto.update.mock.invocationCallOrder[0]);
  });

  it("rejects missing, duplicate, foreign or stale reorder IDs", async () => {
    prisma.scooterPhoto.findMany.mockResolvedValue([
      { id: "one" },
      { id: "two" },
    ]);
    for (const ids of [["one"], ["one", "one"], ["one", "foreign"]])
      await expect(service.reorder("scooter-1", ids)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    expect(prisma.scooterPhoto.update).not.toHaveBeenCalled();
  });

  it("claims an owner- and scooter-scoped upload and makes the first photo the internal cover", async () => {
    prisma.scooterPhoto.findFirst.mockResolvedValue(null);
    await service.attach(
      "scooter-1",
      { fileName: "scooter.jpg", uploadToken: "token" },
      "owner",
    );
    expect(storage.completePresignedUpload).toHaveBeenCalledWith(
      "token",
      "scooter-photo:scooter-1:owner",
    );
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner",
          purpose: "scooter-photo:scooter-1",
          claimedAt: null,
          cleanupStartedAt: null,
          storageKey: stored.storageKey,
          checksumSha256: stored.checksumSha256,
        }) as unknown,
      }),
    );
    expect(prisma.scooterPhoto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          internalCover: true,
          position: 0,
          asset: { create: { ...stored, uploadedByUserId: "owner" } },
        }) as unknown,
      }),
    );
  });

  it("does not attach a draft that cleanup already claimed", async () => {
    prisma.scooterPhoto.findFirst.mockResolvedValue(null);
    prisma.draftUpload.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.attach(
        "scooter-1",
        { fileName: "photo.jpg", uploadToken: "token" },
        "owner",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scooterPhoto.create).not.toHaveBeenCalled();
  });

  it("makes attachment retries idempotent", async () => {
    await service.attach(
      "scooter-1",
      { fileName: "photo.jpg", uploadToken: "token" },
      "owner",
    );
    expect(prisma.draftUpload.updateMany).not.toHaveBeenCalled();
    expect(prisma.scooterPhoto.create).not.toHaveBeenCalled();
  });

  it("enforces the photo limit during attachment under the scooter lock", async () => {
    prisma.scooterPhoto.findFirst.mockResolvedValue(null);
    prisma.scooterPhoto.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, position) => ({ position })),
    );
    await expect(
      service.attach(
        "scooter-1",
        { fileName: "photo.jpg", uploadToken: "token" },
        "owner",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.draftUpload.updateMany).not.toHaveBeenCalled();
  });

  it("does not serve deleted, foreign or archived scooter photos", async () => {
    prisma.scooterPhoto.findFirst.mockResolvedValue(null);
    await expect(
      service.content("scooter-1", "foreign"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.scooterPhoto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "foreign",
          scooterId: "scooter-1",
          deletedAt: null,
          scooter: { deletedAt: null },
          asset: { deletedAt: null },
        },
      }),
    );
    expect(storage.readImage).not.toHaveBeenCalled();
  });

  it("selects the next internal cover when its previous photo is deleted", async () => {
    prisma.scooterPhoto.findFirst
      .mockResolvedValueOnce(photo)
      .mockResolvedValueOnce({ id: "photo-2" });
    await service.remove("scooter-1", "photo-1");
    expect(prisma.scooterPhoto.update).toHaveBeenLastCalledWith({
      where: { id: "photo-2" },
      data: { internalCover: true },
    });
  });
});
