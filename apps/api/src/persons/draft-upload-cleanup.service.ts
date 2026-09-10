import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { ImageStorageService } from "../image-storage/image-storage.service";
import { PrismaService } from "../prisma/prisma.service";

export interface DraftUploadCleanupResult {
  draftUploadsDeleted: number;
  imagesDeleted: number;
}

const CLEANUP_BATCH_SIZE = 100;
const MILLISECONDS_PER_MINUTE = 60 * 1_000;
export const DRAFT_UPLOAD_CLEANUP_CLAIM_STALE_MINUTES = 15;

class DraftUploadCleanupClaimLostError extends Error {
  constructor() {
    super("Cleanup ownership changed before database finalization.");
  }
}

@Injectable()
export class DraftUploadCleanupService {
  private readonly logger = new Logger(DraftUploadCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: "draft-upload-cleanup" })
  async handleCron(): Promise<void> {
    const result = await this.runOnce();
    this.logger.log(
      `draft-upload-cleanup: deleted draftUploads=${result.draftUploadsDeleted} images=${result.imagesDeleted}`,
    );
  }

  async runOnce(limit = CLEANUP_BATCH_SIZE): Promise<DraftUploadCleanupResult> {
    const expiredBefore = new Date();
    const staleCleanupStartedBefore = new Date(
      expiredBefore.getTime() -
        DRAFT_UPLOAD_CLEANUP_CLAIM_STALE_MINUTES * MILLISECONDS_PER_MINUTE,
    );
    const expired = await this.prisma.draftUpload.findMany({
      where: {
        claimedAt: null,
        expiresAt: { lt: expiredBefore },
        OR: [
          { cleanupStartedAt: null },
          { cleanupStartedAt: { lt: staleCleanupStartedBefore } },
        ],
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true, storageKey: true },
    });

    let draftUploadsDeleted = 0;
    let imagesDeleted = 0;
    for (const draft of expired) {
      const cleanupStartedAt = new Date();
      let acquired = false;
      try {
        const claim = await this.prisma.draftUpload.updateMany({
          where: {
            id: draft.id,
            claimedAt: null,
            expiresAt: { lt: expiredBefore },
            OR: [
              { cleanupStartedAt: null },
              { cleanupStartedAt: { lt: staleCleanupStartedBefore } },
            ],
          },
          data: { cleanupStartedAt },
        });
        acquired = claim.count === 1;
      } catch (error) {
        this.logger.warn(
          `draft-upload-cleanup: failed to acquire draftUpload=${draft.id} error=${String(error)}`,
        );
      }

      if (!acquired) {
        continue;
      }

      try {
        await this.imageStorage.deleteImage(draft.storageKey);
        imagesDeleted += 1;
      } catch (error) {
        this.logger.warn(
          `draft-upload-cleanup: storage delete will retry draftUpload=${draft.id} error=${String(error)}`,
        );
        continue;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.expenseExtractionDraft.deleteMany({
            where: {
              sourceUploadId: draft.id,
              confirmedOperationId: null,
            },
          });

          const deleted = await tx.draftUpload.deleteMany({
            where: {
              id: draft.id,
              claimedAt: null,
              cleanupStartedAt,
              expenseExtractionDraft: { is: null },
            },
          });
          if (deleted.count !== 1) {
            throw new DraftUploadCleanupClaimLostError();
          }
        });
        draftUploadsDeleted += 1;
      } catch (error) {
        this.logger.warn(
          `draft-upload-cleanup: database finalize will retry draftUpload=${draft.id} error=${String(error)}`,
        );
      }
    }

    return {
      draftUploadsDeleted,
      imagesDeleted,
    };
  }
}
