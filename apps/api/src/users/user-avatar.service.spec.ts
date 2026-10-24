import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createCanvas } from "@napi-rs/canvas";
import { UserAvatarService, AVATAR_MAX_BYTES } from "./user-avatar.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ avatar: { id: "old", storageKey: "old-key" } }),
      update: jest.fn(),
    },
    mediaAsset: {
      create: jest.fn().mockResolvedValue({ id: "new" }),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest
      .fn()
      .mockImplementation((fn: (db: typeof tx) => unknown) => fn(tx)),
  };
  const stored = {
    provider: "s3",
    bucket: "private",
    storageKey: "new-key",
    contentType: "image/png",
    byteSize: 100,
    checksumSha256: "checksum",
  };
  const storage = {
    storeImage: jest.fn().mockResolvedValue(stored),
    deleteImage: jest.fn().mockResolvedValue(undefined),
    readImage: jest.fn().mockResolvedValue({ body: "stream" }),
  };
  const service = new UserAvatarService(
    prisma as unknown as PrismaService,
    storage as unknown as ImageStorageService,
  );
  return { service, tx, storage, prisma, stored };
}
function upload(buffer: Buffer, size = buffer.length) {
  return { buffer, size, mimetype: "image/png" } as Express.Multer.File;
}

describe("UserAvatarService", () => {
  it("rejects missing, oversized, active-content and malformed images before storage", async () => {
    const { service, storage } = setup();
    for (const file of [
      undefined,
      upload(Buffer.from("x"), AVATAR_MAX_BYTES + 1),
      upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      upload(Buffer.from([255, 216, 255, 0])),
    ]) {
      await expect(service.upload("owner", file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(storage.storeImage).not.toHaveBeenCalled();
  });
  it("stores a normalized raster and replaces the owner's avatar atomically", async () => {
    const { service, tx, storage } = setup();
    const bytes = createCanvas(16, 16).toBuffer("image/png");
    await service.upload("owner", upload(bytes));
    expect(storage.storeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/png",
        category: "user-avatar",
      }),
    );
    expect(tx.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ uploadedByUserId: "owner" }) as unknown,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "owner" },
      data: { avatarAssetId: "new" },
    });
    expect(tx.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: "old" },
      data: { deletedAt: expect.any(Date) as unknown },
    });
    expect(storage.deleteImage).toHaveBeenCalledWith("old-key");
  });
  it("cleans up the new object when persistence fails", async () => {
    const { service, prisma, storage } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(
      service.upload("owner", upload(createCanvas(8, 8).toBuffer("image/png"))),
    ).rejects.toThrow("DB unavailable");
    expect(storage.deleteImage).toHaveBeenCalledWith("new-key");
    expect(storage.deleteImage).not.toHaveBeenCalledWith("old-key");
  });
  it("removes the association and tolerates storage cleanup failure", async () => {
    const { service, tx, storage } = setup();
    storage.deleteImage.mockRejectedValueOnce(new Error("S3 unavailable"));
    await service.replace("owner", null);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "owner" },
      data: { avatarAssetId: null },
    });
    expect(tx.mediaAsset.create).not.toHaveBeenCalled();
  });
  it("never reads unlinked, deleted or document assets through the avatar endpoint", async () => {
    const { service, tx, storage } = setup();
    tx.mediaAsset.findFirst.mockResolvedValue(null);
    await expect(service.read("document-asset")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: {
        id: "document-asset",
        deletedAt: null,
        avatarUser: { deletedAt: null },
      },
    });
    expect(storage.readImage).not.toHaveBeenCalled();
  });
});
