import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredImage } from "../image-storage/image-storage.types";

const purpose = "problem-photo-draft";
const scope = (userId: string) => `${purpose}:${userId}`;
type PreparedPhoto = v1.problems.ProblemPhotoDraft & { stored: StoredImage };

@Injectable()
export class ProblemPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorageService,
  ) {}

  async createUpload(
    userId: string,
    input: v1.scooters.CreateScooterPhotoUpload,
  ) {
    const upload = await this.storage.createPresignedUpload({
      ...input,
      category: "scooter-photo",
      scope: scope(userId),
    });
    await this.prisma.draftUpload.create({
      data: {
        userId,
        purpose,
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
      maxBytes: upload.maxBytes,
    };
  }

  async prepare(userId: string, photos: v1.problems.ProblemPhotoDraft[]) {
    const prepared: PreparedPhoto[] = [];
    const keys = new Set<string>();
    for (const photo of photos) {
      const stored = await this.storage.completePresignedUpload(
        photo.uploadToken,
        scope(userId),
      );
      if (keys.has(stored.storageKey))
        throw new BadRequestException("Duplicate problem photo");
      keys.add(stored.storageKey);
      prepared.push({ ...photo, stored });
    }
    return prepared;
  }

  async attach(
    tx: Prisma.TransactionClient,
    problemId: string,
    userId: string,
    photos: PreparedPhoto[],
  ) {
    for (const { stored, fileName } of photos) {
      const now = new Date();
      const claim = await tx.draftUpload.updateMany({
        where: {
          userId,
          purpose,
          provider: stored.provider,
          bucket: stored.bucket,
          storageKey: stored.storageKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
          claimedAt: null,
          cleanupStartedAt: null,
          expiresAt: { gt: now },
        },
        data: { claimedAt: now },
      });
      if (claim.count !== 1)
        throw new BadRequestException(
          "Photo expired or already used. Upload it again.",
        );
      await tx.scooterProblemPhoto.create({
        data: {
          problem: { connect: { id: problemId } },
          fileName,
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
    }
  }

  async content(problemId: string, photoId: string) {
    const photo = await this.prisma.scooterProblemPhoto.findFirst({
      where: { id: photoId, problemId, asset: { deletedAt: null } },
      include: { asset: true },
    });
    if (!photo) throw new NotFoundException("Photo not found");
    return this.storage.readImage(photo.asset.storageKey);
  }
}
