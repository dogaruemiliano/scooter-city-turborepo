import { createCanvas } from "@napi-rs/canvas";
import { ForbiddenException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { PrismaService } from "../prisma/prisma.service";
import type { AccessService } from "../access/access.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { AuditService } from "../audit/audit.service";
import { RentalMediaService } from "./rental-media.service";

const png = createCanvas(220, 220).toBuffer("image/png");
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function setup() {
  const photo = {
    id: "photo",
    fileName: "test.png",
    assetId: "asset",
    createdAt: new Date("2026-10-30T10:00:00Z"),
    asset: {
      storageKey: "private/test.png",
      contentType: "image/png",
      byteSize: png.length,
      checksumSha256: hash(png),
    },
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    rental: {
      findUnique: jest.fn().mockResolvedValue({
        id: "rental",
        scooterId: "scooter",
        status: "reserved",
      }),
    },
    scooterPhoto: {
      findMany: jest.fn().mockResolvedValue([photo]),
      findFirst: jest.fn().mockResolvedValue(photo),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(photo),
    },
    mediaAsset: { count: jest.fn().mockResolvedValue(0) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(
      async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    ),
  };
  const access = {
    getSnapshot: jest
      .fn()
      .mockResolvedValue({ isSuperAdmin: true, effectiveScopes: {} }),
  };
  const storage = {
    storeImage: jest.fn().mockImplementation(({ buffer }: { buffer: Buffer }) =>
      Promise.resolve({
        provider: "s3",
        bucket: "private",
        storageKey: "private/fresh.png",
        contentType: "image/png",
        byteSize: buffer.length,
        checksumSha256: hash(buffer),
      }),
    ),
    deleteImage: jest.fn().mockResolvedValue(undefined),
    readImage: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ body: Readable.from([png]) }),
      ),
  };
  const audit = { recordRequired: jest.fn().mockResolvedValue(undefined) };
  const service = new RentalMediaService(
    prisma as unknown as PrismaService,
    access as unknown as AccessService,
    storage as unknown as ImageStorageService,
    audit as unknown as AuditService,
  );
  const file = {
    originalname: "../test.jpg",
    mimetype: "text/plain",
    buffer: png,
    size: png.length,
  } as Express.Multer.File;
  return { service, prisma, tx, storage, access, audit, file, photo };
}

describe("private rental media", () => {
  it("lists only the requested rental and event and returns safe metadata", async () => {
    const { service, tx } = setup();
    expect(await service.list("operator", "rental", "handover")).toEqual({
      items: [
        {
          id: "photo",
          fileName: "test.png",
          contentType: "image/png",
          createdAt: "2026-10-30T10:00:00.000Z",
        },
      ],
    });
    expect(tx.scooterPhoto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          rentalId: "rental",
          scooterId: "scooter",
          type: "RENTAL_BEFORE",
          deletedAt: null,
          asset: {
            deletedAt: null,
            contentType: { in: ["image/png", "image/jpeg", "image/webp"] },
          },
        },
      }),
    );
  });
  it("requires rental read scope before loading media", async () => {
    const { service, access, tx } = setup();
    access.getSnapshot.mockResolvedValue({
      isSuperAdmin: false,
      effectiveScopes: {},
    });
    await expect(
      service.list("operator", "rental", "return"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.rental.findUnique).not.toHaveBeenCalled();
  });
  it("checks the event-specific write grant before touching storage", async () => {
    const { service, access, storage, file } = setup();
    access.getSnapshot.mockResolvedValue({
      isSuperAdmin: false,
      effectiveScopes: { "rentals.handover": ["ALL"] },
    });
    await expect(
      service.upload("operator", "rental", "return", file),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.storeImage).not.toHaveBeenCalled();
  });
  it("stores actual decoded raster content privately and ignores browser MIME and path metadata", async () => {
    const { service, file, tx, storage, audit } = setup();
    const result = await service.upload("operator", "rental", "handover", file);
    expect(result.contentType).toBe("image/png");
    expect(storage.storeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/png",
        category: "scooter-photo",
      }),
    );
    expect(tx.scooterPhoto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RENTAL_BEFORE",
          isPublic: false,
          fileName: "test.png",
        }) as unknown,
      }),
    );
    expect(audit.recordRequired).toHaveBeenCalled();
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });
  it("rejects disguised SVG/HTML before creating a stored object", async () => {
    const { service, file, storage } = setup();
    await expect(
      service.upload("operator", "rental", "handover", {
        ...file,
        buffer: Buffer.from("<svg onload='evil'/>"),
        mimetype: "image/png",
      }),
    ).rejects.toThrow("real PNG or JPEG");
    expect(storage.storeImage).not.toHaveBeenCalled();
  });
  it("rejects uploads outside the requested checkout phase", async () => {
    const { service, tx, file, storage } = setup();
    tx.rental.findUnique.mockResolvedValue({
      id: "rental",
      scooterId: "scooter",
      status: "returned",
    });
    await expect(
      service.upload("operator", "rental", "return", file),
    ).rejects.toThrow("corresponding handover");
    expect(storage.storeImage).not.toHaveBeenCalled();
  });
  it("rechecks phase after storage and cleans only a confirmed unreferenced object", async () => {
    const { service, tx, storage, file } = setup();
    tx.rental.findUnique
      .mockResolvedValueOnce({
        id: "rental",
        scooterId: "scooter",
        status: "reserved",
      })
      .mockResolvedValue({
        id: "rental",
        scooterId: "scooter",
        status: "active",
      });
    await expect(
      service.upload("operator", "rental", "handover", file),
    ).rejects.toThrow("corresponding handover");
    expect(storage.deleteImage).toHaveBeenCalledWith("private/fresh.png");
  });
  it("preserves uploaded bytes after an uncertain transaction result when a reference exists", async () => {
    const { service, prisma, tx, storage, file } = setup();
    prisma.$transaction.mockRejectedValue(new Error("Connection lost"));
    tx.mediaAsset.count.mockResolvedValue(1);
    await expect(
      service.upload("operator", "rental", "handover", file),
    ).rejects.toThrow("Connection lost");
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });
  it("preserves uploaded bytes when reference verification is unavailable", async () => {
    const { service, prisma, tx, storage, file } = setup();
    prisma.$transaction.mockRejectedValue(new Error("Connection lost"));
    tx.mediaAsset.count.mockRejectedValue(new Error("Database unavailable"));
    await expect(
      service.upload("operator", "rental", "handover", file),
    ).rejects.toThrow("Connection lost");
    expect(storage.deleteImage).not.toHaveBeenCalled();
  });
  it("applies a per-event file count limit while holding the rental lock", async () => {
    const { service, tx, file } = setup();
    tx.scooterPhoto.count.mockResolvedValue(100);
    await expect(
      service.upload("operator", "rental", "handover", file),
    ).rejects.toThrow("limit");
    expect(tx.scooterPhoto.create).not.toHaveBeenCalled();
  });
  it("refuses cross-rental and gallery IDs on the download route", async () => {
    const { service, tx, storage } = setup();
    tx.scooterPhoto.findFirst.mockResolvedValue(null);
    await expect(
      service.content("operator", "rental", "other-photo"),
    ).rejects.toThrow("not found");
    expect(storage.readImage).not.toHaveBeenCalled();
    expect(tx.scooterPhoto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "other-photo",
          rentalId: "rental",
          scooterId: "scooter",
          type: { in: ["RENTAL_BEFORE", "RENTAL_AFTER"] },
          deletedAt: null,
          asset: { deletedAt: null },
        },
      }),
    );
  });
  it("verifies exact stored media bytes before audited access", async () => {
    const { service, storage, audit } = setup();
    expect(
      (await service.content("operator", "rental", "photo")).buffer,
    ).toEqual(png);
    expect(audit.recordRequired).toHaveBeenCalled();
    audit.recordRequired.mockClear();
    storage.readImage.mockImplementation(() =>
      Promise.resolve({ body: Readable.from([Buffer.alloc(png.length)]) }),
    );
    await expect(
      service.content("operator", "rental", "photo"),
    ).rejects.toThrow("integrity");
    expect(audit.recordRequired).not.toHaveBeenCalled();
  });
});
