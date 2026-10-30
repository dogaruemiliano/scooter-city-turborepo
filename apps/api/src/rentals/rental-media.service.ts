import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { v1 } from "@repo/api-shared";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { AuditEventType } from "../audit/audit.types";
import { ImageStorageService } from "../image-storage/image-storage.service";
import { sanitizeSigningImage } from "../contract-templates/signing-images";

const photoType = (event: v1.rentals.RentalMediaEvent) =>
  event === "handover" ? ("RENTAL_BEFORE" as const) : ("RENTAL_AFTER" as const);
const maxFiles = 100;
const maxBytes = 8 * 1024 * 1024;

/** Rental evidence uses append-only private photo rows, isolated from the editable scooter gallery. */
@Injectable()
export class RentalMediaService {
  constructor(
    readonly prisma: PrismaService,
    readonly access: AccessService,
    readonly storage: ImageStorageService,
    readonly audit: AuditService,
  ) {}

  private async require(
    userId: string,
    permission: "rentals.read" | "rentals.handover" | "rentals.return",
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const snapshot = await this.access.getSnapshot(userId, tx);
    if (
      !snapshot.isSuperAdmin &&
      !snapshot.effectiveScopes[permission]?.includes("ALL")
    )
      throw new ForbiddenException("Permission required");
  }
  private async rental(
    id: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const rental = await tx.rental.findUnique({ where: { id } });
    if (!rental) throw new NotFoundException("Rental not found");
    return rental;
  }
  private assertEventState(
    status: string,
    eventType: v1.rentals.RentalMediaEvent,
  ): void {
    if (status !== (eventType === "handover" ? "reserved" : "active"))
      throw new ConflictException(
        "Capture media during the corresponding handover or return checkout",
      );
  }
  async list(
    userId: string,
    rentalId: string,
    eventType: v1.rentals.RentalMediaEvent,
  ): Promise<{ items: v1.rentals.RentalMedia[] }> {
    await this.require(userId, "rentals.read");
    const rental = await this.rental(rentalId);
    const photos = await this.prisma.scooterPhoto.findMany({
      where: {
        rentalId,
        scooterId: rental.scooterId,
        type: photoType(eventType),
        deletedAt: null,
        asset: {
          deletedAt: null,
          contentType: { in: ["image/png", "image/jpeg", "image/webp"] },
        },
      },
      include: { asset: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    return {
      items: photos.map((photo) =>
        v1.rentals.rentalMediaSchema.parse({
          id: photo.id,
          fileName: photo.fileName,
          contentType: photo.asset.contentType,
          createdAt: photo.createdAt.toISOString(),
        }),
      ),
    };
  }
  async upload(
    userId: string,
    rentalId: string,
    eventType: v1.rentals.RentalMediaEvent,
    file: Express.Multer.File,
  ): Promise<v1.rentals.RentalMedia> {
    const permission =
      eventType === "handover" ? "rentals.handover" : "rentals.return";
    await this.require(userId, permission);
    const initial = await this.rental(rentalId);
    this.assertEventState(initial.status, eventType);
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length > maxBytes)
      throw new BadRequestException("A raster image up to 8 MiB is required");
    // Decode and re-encode real raster bytes. Browser MIME and extension are never trusted.
    const bytes = await sanitizeSigningImage(file.buffer, false);
    if (bytes.length > maxBytes)
      throw new BadRequestException(
        "The sanitized image exceeds the permitted size",
      );
    const name = basename(file.originalname.replaceAll("\\", "/"));
    const stem =
      name
        .slice(0, name.length - extname(name).length)
        .replace(/\p{Cc}/gu, "")
        .trim()
        .slice(0, 180) || "rental-photo";
    const stored = await this.storage.storeImage({
      buffer: bytes,
      byteSize: bytes.length,
      contentType: "image/png",
      category: "scooter-photo",
    });
    let committed = false;
    try {
      const photo = await this.prisma.$transaction(async (tx) => {
        await this.require(userId, permission, tx);
        await tx.$queryRaw`SELECT id FROM "Scooter" WHERE id = ${initial.scooterId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Rental" WHERE id = ${rentalId} FOR UPDATE`;
        const current = await this.rental(rentalId, tx);
        this.assertEventState(current.status, eventType);
        if (current.scooterId !== initial.scooterId)
          throw new ConflictException(
            "Rental scooter changed while uploading media",
          );
        const count = await tx.scooterPhoto.count({
          where: { rentalId, type: photoType(eventType), deletedAt: null },
        });
        if (count >= maxFiles)
          throw new ConflictException(
            "The inspection media limit has been reached",
          );
        const photo = await tx.scooterPhoto.create({
          data: {
            rental: { connect: { id: rentalId } },
            scooter: { connect: { id: current.scooterId } },
            type: photoType(eventType),
            position: count,
            isPublic: false,
            fileName: `${stem}.png`,
            asset: {
              create: {
                provider: stored.provider,
                bucket: stored.bucket,
                storageKey: stored.storageKey,
                contentType: stored.contentType,
                byteSize: stored.byteSize,
                checksumSha256: stored.checksumSha256,
                uploadedByUserId: userId,
              },
            },
          },
        });
        await this.audit.recordRequired(tx, {
          type: AuditEventType.RENTAL_MEDIA_UPLOADED,
          userId,
          targetType: "Rental",
          targetId: rentalId,
          meta: {
            photoId: photo.id,
            assetId: photo.assetId,
            eventType,
            sha256: stored.checksumSha256,
          },
        });
        return photo;
      });
      committed = true;
      return v1.rentals.rentalMediaSchema.parse({
        id: photo.id,
        fileName: photo.fileName,
        contentType: "image/png",
        createdAt: photo.createdAt.toISOString(),
      });
    } finally {
      // Only the fresh unreferenced key created by this operation is eligible for cleanup.
      if (!committed) {
        // Preserve bytes after an uncertain transaction result unless absence is confirmed.
        const references = await this.prisma.mediaAsset
          .count({ where: { storageKey: stored.storageKey } })
          .catch(() => null);
        if (references === 0)
          await this.storage
            .deleteImage(stored.storageKey)
            .catch(() => undefined);
      }
    }
  }
  async content(
    userId: string,
    rentalId: string,
    mediaId: string,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    await this.require(userId, "rentals.read");
    const rental = await this.rental(rentalId);
    const photo = await this.prisma.scooterPhoto.findFirst({
      where: {
        id: mediaId,
        rentalId,
        scooterId: rental.scooterId,
        type: { in: ["RENTAL_BEFORE", "RENTAL_AFTER"] },
        deletedAt: null,
        asset: { deletedAt: null },
      },
      include: { asset: true },
    });
    if (
      !photo ||
      !["image/png", "image/jpeg", "image/webp"].includes(
        photo.asset.contentType,
      )
    )
      throw new NotFoundException("Rental media not found");
    const stored = await this.storage.readImage(photo.asset.storageKey);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stored.body) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > maxBytes || size > photo.asset.byteSize) {
        stored.body.destroy();
        throw new ConflictException(
          "Stored media failed integrity verification",
        );
      }
      chunks.push(bytes);
    }
    const buffer = Buffer.concat(chunks);
    if (
      buffer.length !== photo.asset.byteSize ||
      createHash("sha256").update(buffer).digest("hex") !==
        photo.asset.checksumSha256
    )
      throw new ConflictException("Stored media failed integrity verification");
    await this.audit.recordRequired(this.prisma, {
      type: AuditEventType.RENTAL_MEDIA_ACCESSED,
      userId,
      targetType: "Rental",
      targetId: rentalId,
      meta: { photoId: photo.id, assetId: photo.assetId },
    });
    return {
      buffer,
      contentType: photo.asset.contentType,
      fileName: photo.fileName,
    };
  }
}
