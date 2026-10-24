import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PrismaService } from "../prisma/prisma.service";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredImage } from "../image-storage/image-storage.types";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class UserAvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorageService,
  ) {}

  async upload(
    userId: string,
    file?: Express.Multer.File,
    uploadedByUserId = userId,
  ) {
    if (!file?.buffer.length || file.size > AVATAR_MAX_BYTES)
      throw new BadRequestException("Choose an image up to 5 MB");
    // Reject SVG and other active content; decode and re-encode raster bytes.
    const bytes = file.buffer;
    const raster =
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
      (bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP");
    if (!raster)
      throw new BadRequestException("Choose a JPEG, PNG or WebP image");
    const image = await loadImage(bytes).catch(() => {
      throw new BadRequestException("Invalid image");
    });
    if (
      !image.width ||
      !image.height ||
      image.width > 4096 ||
      image.height > 4096
    )
      throw new BadRequestException(
        "Image dimensions must be at most 4096 pixels",
      );
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const canvas = createCanvas(
      Math.max(1, Math.round(image.width * scale)),
      Math.max(1, Math.round(image.height * scale)),
    );
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const buffer = canvas.toBuffer("image/png");
    const stored = await this.storage.storeImage({
      buffer,
      byteSize: buffer.length,
      contentType: "image/png",
      category: "user-avatar",
    });
    try {
      await this.replace(userId, stored, uploadedByUserId);
    } catch (error) {
      await this.storage.deleteImage(stored.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async replace(
    userId: string,
    stored: StoredImage | null,
    uploadedByUserId = userId,
  ) {
    const previous = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { avatar: true },
      });
      if (!user) throw new NotFoundException("User not found");
      const asset = stored
        ? await tx.mediaAsset.create({
            data: { ...stored, uploadedByUserId },
          })
        : null;
      await tx.user.update({
        where: { id: userId },
        data: { avatarAssetId: asset?.id ?? null },
      });
      if (user.avatar)
        await tx.mediaAsset.update({
          where: { id: user.avatar.id },
          data: { deletedAt: new Date() },
        });
      return user.avatar;
    });
    if (previous)
      await this.storage
        .deleteImage(previous.storageKey)
        .catch(() => undefined);
  }

  async read(assetId: string) {
    // Only avatar assets can be read here, never document or other private assets.
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, deletedAt: null, avatarUser: { deletedAt: null } },
    });
    if (!asset) throw new NotFoundException("Avatar not found");
    return this.storage.readImage(asset.storageKey);
  }
}
