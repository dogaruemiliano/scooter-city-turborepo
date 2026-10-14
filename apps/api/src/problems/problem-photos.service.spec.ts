import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import { ProblemPhotosService } from "./problem-photos.service";

const stored = {
  provider: "s3" as const,
  bucket: "private",
  storageKey: "key",
  contentType: "image/jpeg" as const,
  byteSize: 20,
  checksumSha256: "a".repeat(64),
};
describe("Problem photo ownership", () => {
  const db = {
    draftUpload: { create: jest.fn(), updateMany: jest.fn() },
    scooterProblemPhoto: { create: jest.fn(), findFirst: jest.fn() },
  };
  const storage = {
    completePresignedUpload: jest.fn(),
    readImage: jest.fn(),
    createPresignedUpload: jest.fn(),
  };
  const service = new ProblemPhotosService(
    db as unknown as PrismaService,
    storage as unknown as ImageStorageService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    storage.completePresignedUpload.mockResolvedValue(stored);
    db.draftUpload.updateMany.mockResolvedValue({ count: 1 });
  });
  it("binds completion tokens to the uploader and rejects duplicate objects", async () => {
    await expect(
      service.prepare("member", [
        { fileName: "a.jpg", uploadToken: "one" },
        { fileName: "b.jpg", uploadToken: "two" },
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(storage.completePresignedUpload).toHaveBeenCalledWith(
      "one",
      "problem-photo-draft:member",
    );
  });
  it("refuses an expired, stolen, claimed or cleaning upload", async () => {
    db.draftUpload.updateMany.mockResolvedValue({ count: 0 });
    const prepared = await service.prepare("member", [
      { fileName: "a.jpg", uploadToken: "one" },
    ]);
    await expect(
      service.attach(
        db as unknown as Prisma.TransactionClient,
        "problem",
        "member",
        prepared,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(db.draftUpload.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "member",
          purpose: "problem-photo-draft",
          storageKey: "key",
          claimedAt: null,
          cleanupStartedAt: null,
          expiresAt: { gt: expect.any(Date) as unknown },
        }) as unknown,
      }),
    );
    expect(db.scooterProblemPhoto.create).not.toHaveBeenCalled();
  });
  it("stores only image metadata and attaches to the selected problem", async () => {
    storage.completePresignedUpload.mockResolvedValue({
      ...stored,
      imageWidth: 100,
      pageCount: 1,
    });
    const prepared = await service.prepare("member", [
      { fileName: "a.jpg", uploadToken: "one" },
    ]);
    await service.attach(
      db as unknown as Prisma.TransactionClient,
      "problem",
      "member",
      prepared,
    );
    const { data } = (
      db.scooterProblemPhoto.create.mock.calls as unknown as [
        { data: { problem: unknown; asset: { create: unknown } } },
      ][]
    )[0][0];
    expect(data.problem).toEqual({ connect: { id: "problem" } });
    expect(data.asset.create).toEqual({
      ...stored,
      uploadedByUserId: "member",
    });
  });
  it("never serves a photo from a different problem", async () => {
    db.scooterProblemPhoto.findFirst.mockResolvedValue(null);
    await expect(service.content("other-problem", "photo")).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.readImage).not.toHaveBeenCalled();
  });
});
