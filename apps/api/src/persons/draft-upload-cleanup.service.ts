import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { ImageStorageService } from "../image-storage/image-storage.service";
import { PrismaService } from "../prisma/prisma.service";

export interface DraftUploadCleanupResult {
  draftUploadsDeleted: number;
  imagesDeleted: number;
}

const CLEANUP_BATCH_SIZE = 100;

@Injectable()
export class DraftUploadCleanupService {
  private readonly logger = new Logger(DraftUploadCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: "person-draft-upload-cleanup" })
  async handleCron(): Promise<void> {
    const result = await this.runOnce();
    this.logger.log(
      `person-draft-upload-cleanup: deleted draftUploads=${result.draftUploadsDeleted} images=${result.imagesDeleted}`,
    );
  }

  async runOnce(limit = CLEANUP_BATCH_SIZE): Promise<DraftUploadCleanupResult> {
    const expired = await this.prisma.draftUpload.findMany({
      where: {
        claimedAt: null,
        expiresAt: { lt: new Date() },
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: limit,
    });

    const deletedIds: string[] = [];
    for (const draft of expired) {
      try {
        await this.imageStorage.deleteImage(draft.storageKey);
        deletedIds.push(draft.id);
      } catch (error) {
        this.logger.warn(
          `person-draft-upload-cleanup: failed storageKey=${draft.storageKey} error=${String(error)}`,
        );
      }
    }

    const deleted =
      deletedIds.length > 0
        ? await this.prisma.draftUpload.deleteMany({
            where: {
              id: { in: deletedIds },
              claimedAt: null,
            },
          })
        : { count: 0 };

    return {
      draftUploadsDeleted: deleted.count,
      imagesDeleted: deleted.count,
    };
  }
}
