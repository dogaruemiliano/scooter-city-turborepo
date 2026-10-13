import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredImage } from "../image-storage/image-storage.types";

const galleryTypes = [...v1.scooters.SCOOTER_GALLERY_PHOTO_TYPES];
const galleryFilter = { type: { in: galleryTypes } };

const purpose = (id: string) => `scooter-photo:${id}`;
const scope = (id: string, userId: string) => `${purpose(id)}:${userId}`;
const draftPurpose = "scooter-photo-draft";
const draftScope = (userId: string) => `${draftPurpose}:${userId}`;
type PreparedPhoto = v1.scooters.ScooterPhotoDraft & { stored: StoredImage };

function photoAssetData(
  stored: StoredImage,
  uploadedByUserId?: string,
): Prisma.MediaAssetUncheckedCreateWithoutScooterPhotosInput {
  // Storage completion also returns document metadata at runtime. Only these
  // fields belong to MediaAsset; spreading the response passes invalid fields.
  return {
    provider: stored.provider,
    bucket: stored.bucket,
    storageKey: stored.storageKey,
    contentType: stored.contentType,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256,
    uploadedByUserId,
  };
}

@Injectable()
export class ScooterPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorageService,
  ) {}

  private async requireScooter(id: string) {
    if (
      !(await this.prisma.scooter.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Scooter not found");
  }

  // Every gallery write locks the same parent row, including upload attachment.
  private async lock(tx: Prisma.TransactionClient, id: string) {
    const result = await tx.scooter.updateMany({
      where: { id, deletedAt: null },
      data: { updatedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException("Scooter not found");
  }

  async list(id: string) {
    await this.requireScooter(id);
    const photos = await this.prisma.scooterPhoto.findMany({
      where: {
        scooterId: id,
        deletedAt: null,
        ...galleryFilter,
        asset: { deletedAt: null },
      },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return photos.flatMap((photo) => {
      if (photo.type !== "GALLERY" && photo.type !== "GALLERY_COVER") return [];
      return [
        {
          id: photo.id,
          fileName: photo.fileName,
          caption: photo.caption,
          position: photo.position,
          isPublic: photo.isPublic,
          type: photo.type,
          contentUrl: v1.scooters.ROUTES.photos.content(id, photo.id),
          createdAt: photo.createdAt.toISOString(),
        },
      ];
    });
  }

  async createUpload(
    id: string,
    input: v1.scooters.CreateScooterPhotoUpload,
    userId: string,
  ) {
    await this.requireScooter(id);
    const count = await this.prisma.scooterPhoto.count({
      where: { scooterId: id, deletedAt: null, ...galleryFilter },
    });
    if (count >= v1.scooters.SCOOTER_PHOTO_MAX_FILES)
      throw new BadRequestException("Too many scooter photos");
    const upload = await this.storage.createPresignedUpload({
      ...input,
      category: "scooter-photo",
      scope: scope(id, userId),
    });
    await this.prisma.draftUpload.create({
      data: {
        userId,
        purpose: purpose(id),
        provider: upload.provider,
        bucket: upload.bucket,
        storageKey: upload.storageKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        expiresAt: upload.expiresAt,
      },
    });
    return {
      uploadUrl: upload.uploadUrl,
      uploadToken: upload.uploadToken,
      headers: upload.headers,
      maxBytes: Math.min(upload.maxBytes, v1.scooters.SCOOTER_PHOTO_MAX_BYTES),
    };
  }

  async createDraftUpload(
    input: v1.scooters.CreateScooterPhotoUpload,
    userId: string,
  ) {
    const upload = await this.storage.createPresignedUpload({
      ...input,
      category: "scooter-photo",
      scope: draftScope(userId),
      completionTokenTtlSeconds: 86_400,
    });
    await this.prisma.draftUpload.create({
      data: {
        userId,
        purpose: draftPurpose,
        provider: upload.provider,
        bucket: upload.bucket,
        storageKey: upload.storageKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        expiresAt: upload.uploadTokenExpiresAt ?? upload.expiresAt,
      },
    });
    return {
      uploadUrl: upload.uploadUrl,
      uploadToken: upload.uploadToken,
      headers: upload.headers,
      maxBytes: Math.min(upload.maxBytes, v1.scooters.SCOOTER_PHOTO_MAX_BYTES),
    };
  }

  async prepareDrafts(
    drafts: v1.scooters.ScooterPhotoDraft[] = [],
    userId?: string,
  ): Promise<PreparedPhoto[]> {
    if (!drafts.length) return [];
    if (!userId)
      throw new BadRequestException("Photo upload owner is required");
    const checked = v1.scooters.scooterPhotoDraftsSchema.parse(drafts);
    const prepared: PreparedPhoto[] = [];
    const keys = new Set<string>();
    for (const photo of checked) {
      const stored = await this.storage.completePresignedUpload(
        photo.uploadToken,
        draftScope(userId),
      );
      if (keys.has(stored.storageKey))
        throw new BadRequestException("Duplicate photo upload");
      keys.add(stored.storageKey);
      prepared.push({ ...photo, stored });
    }
    return prepared;
  }

  // Called inside scooter creation, so failed photo claims roll back the fleet number too.
  async applyDrafts(
    tx: Prisma.TransactionClient,
    scooterId: string,
    photos: PreparedPhoto[],
    userId?: string,
  ) {
    const hasCover = photos.some((photo) => photo.type === "GALLERY_COVER");
    if (photos.length && !userId)
      throw new BadRequestException("Photo uploads require an owner");
    for (const [position, photo] of photos.entries()) {
      const now = new Date();
      const claimed = await tx.draftUpload.updateMany({
        where: {
          userId,
          purpose: draftPurpose,
          storageKey: photo.stored.storageKey,
          provider: photo.stored.provider,
          bucket: photo.stored.bucket,
          contentType: photo.stored.contentType,
          byteSize: photo.stored.byteSize,
          checksumSha256: photo.stored.checksumSha256,
          claimedAt: null,
          cleanupStartedAt: null,
          expiresAt: { gt: now },
        },
        data: { claimedAt: now },
      });
      if (claimed.count !== 1)
        throw new BadRequestException(
          "Photo upload expired or was already used. Upload it again.",
        );
      await tx.scooterPhoto.create({
        data: {
          scooter: { connect: { id: scooterId } },
          fileName: photo.fileName,
          caption: photo.caption,
          position,
          type:
            photo.type === "GALLERY_COVER" || (!hasCover && position === 0)
              ? "GALLERY_COVER"
              : "GALLERY",
          isPublic: photo.isPublic,
          asset: { create: photoAssetData(photo.stored, userId) },
        },
      });
    }
  }

  async attach(
    id: string,
    input: v1.scooters.AttachScooterPhoto,
    userId: string,
  ) {
    await this.requireScooter(id);
    const stored = await this.storage.completePresignedUpload(
      input.uploadToken,
      scope(id, userId),
    );
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      // A lost response can be retried without creating a second photo.
      const existing = await tx.scooterPhoto.findFirst({
        where: {
          scooterId: id,
          deletedAt: null,
          ...galleryFilter,
          asset: { storageKey: stored.storageKey, uploadedByUserId: userId },
        },
      });
      if (existing) return;
      const photos = await tx.scooterPhoto.findMany({
        where: { scooterId: id, deletedAt: null, ...galleryFilter },
        select: { position: true, type: true },
      });
      if (photos.length >= v1.scooters.SCOOTER_PHOTO_MAX_FILES)
        throw new BadRequestException("Too many scooter photos");
      const now = new Date();
      const claim = await tx.draftUpload.updateMany({
        where: {
          userId,
          purpose: purpose(id),
          storageKey: stored.storageKey,
          provider: stored.provider,
          bucket: stored.bucket,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
          expiresAt: { gt: now },
          claimedAt: null,
          cleanupStartedAt: null,
        },
        data: { claimedAt: now },
      });
      if (claim.count !== 1)
        throw new BadRequestException(
          "Photo upload expired or was already used. Upload it again.",
        );
      await tx.scooterPhoto.create({
        data: {
          scooter: { connect: { id } },
          fileName: input.fileName,
          position:
            photos.reduce((max, photo) => Math.max(max, photo.position), -1) +
            1,
          type: photos.some((photo) => photo.type === "GALLERY_COVER")
            ? "GALLERY"
            : "GALLERY_COVER",
          asset: { create: photoAssetData(stored, userId) },
        },
      });
    });
    return this.list(id);
  }

  async update(
    id: string,
    photoId: string,
    input: v1.scooters.UpdateScooterPhoto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const photo = await tx.scooterPhoto.findFirst({
        where: {
          id: photoId,
          scooterId: id,
          deletedAt: null,
          ...galleryFilter,
        },
      });
      if (!photo) throw new NotFoundException("Photo not found");
      if (input.type === "GALLERY_COVER") {
        await tx.scooterPhoto.updateMany({
          where: { scooterId: id, deletedAt: null, type: "GALLERY_COVER" },
          data: { type: "GALLERY" },
        });
      }
      await tx.scooterPhoto.update({ where: { id: photoId }, data: input });
    });
    return this.list(id);
  }

  async reorder(id: string, photoIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const photos = await tx.scooterPhoto.findMany({
        where: { scooterId: id, deletedAt: null, ...galleryFilter },
        select: { id: true },
      });
      const ids = new Set(photoIds);
      if (
        ids.size !== photoIds.length ||
        photos.length !== photoIds.length ||
        photos.some((photo) => !ids.has(photo.id))
      )
        throw new BadRequestException(
          "Photo order must contain every current photo exactly once. Reload the gallery.",
        );
      for (const [position, photoId] of photoIds.entries())
        await tx.scooterPhoto.update({
          where: { id: photoId },
          data: { position },
        });
    });
    return this.list(id);
  }

  async remove(id: string, photoId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const photo = await tx.scooterPhoto.findFirst({
        where: {
          id: photoId,
          scooterId: id,
          deletedAt: null,
          ...galleryFilter,
        },
      });
      if (!photo) throw new NotFoundException("Photo not found");
      await tx.scooterPhoto.update({
        where: { id: photoId },
        data: {
          deletedAt: new Date(),
          type: "GALLERY",
        },
      });
      // Keep a gallery cover when the previous cover is removed.
      if (photo.type === "GALLERY_COVER") {
        const next = await tx.scooterPhoto.findFirst({
          where: { scooterId: id, deletedAt: null, ...galleryFilter },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        });
        if (next)
          await tx.scooterPhoto.update({
            where: { id: next.id },
            data: { type: "GALLERY_COVER" },
          });
      }
    });
    return this.list(id);
  }

  async content(id: string, photoId: string) {
    const photo = await this.prisma.scooterPhoto.findFirst({
      where: {
        id: photoId,
        scooterId: id,
        deletedAt: null,
        ...galleryFilter,
        scooter: { deletedAt: null },
        asset: { deletedAt: null },
      },
      include: { asset: true },
    });
    if (!photo) throw new NotFoundException("Photo not found");
    return {
      ...(await this.storage.readImage(photo.asset.storageKey)),
      contentType: photo.asset.contentType,
    };
  }
}
