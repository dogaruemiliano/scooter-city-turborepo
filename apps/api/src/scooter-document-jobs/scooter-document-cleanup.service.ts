import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { randomUUID } from "node:crypto";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import {
  Prisma,
  type ScooterDocumentResource,
} from "../generated/prisma/client";
import { ImageStorageService } from "../image-storage/image-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { OpenAiScooterDocumentJobProvider } from "../scooter-document-extraction/openai-scooter-document-job.provider";
import {
  ACTIVE_JOB_STATES,
  documentJobFailureDetails,
  AUDIT_RETENTION_MS,
  SESSION_LIFETIME_MS,
  WORKER_LEASE_MS,
  lockEditorSession,
} from "./document-job-lifecycle";
import { ScooterDocumentJobsService } from "./scooter-document-jobs.service";

@Injectable()
export class ScooterDocumentCleanupService {
  private readonly logger = new Logger(ScooterDocumentCleanupService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorageService,
    private readonly provider: OpenAiScooterDocumentJobProvider,
    private readonly jobs: ScooterDocumentJobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Cron("0 */5 * * * *", {
    name: "scooter-document-cleanup",
    waitForCompletion: true,
  })
  async tick() {
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.warn(
        documentJobFailureDetails(error),
        "Document cleanup failed; resource records retained for retry.",
      );
    }
  }

  async runOnce() {
    const now = new Date();
    const sessions = await this.prisma.scooterDocumentEditorSession.findMany({
      where: { status: { in: ["open", "saved"] }, expiresAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    for (const session of sessions)
      await this.jobs.closeSession(session.id, "expired");
    const resources = await this.prisma.scooterDocumentResource.findMany({
      where: {
        status: { not: "retained" },
        cleanupAfter: { lte: now },
        lastPossibleWriteAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { cleanupAfter: "asc" },
      take: 100,
    });
    // Small bounded batches avoid tying up the API process or provider for minutes.
    for (let offset = 0; offset < resources.length; offset += 4)
      await Promise.all(
        resources
          .slice(offset, offset + 4)
          .map((resource) => this.clean(resource)),
      );
    await this.reconcileTemporaryObjects();
    // Only non-content successful audit rows age out. Unknown submissions and failures remain visible.
    const auditBefore = new Date(Date.now() - AUDIT_RETENTION_MS);
    await this.prisma.scooterDocumentResource.deleteMany({
      where: {
        status: "deleted",
        deletedAt: { lt: auditBefore },
        lastPossibleWriteAt: { lt: auditBefore },
        errorCode: null,
      },
    });
    await this.prisma.scooterDocumentProviderEvent.deleteMany({
      where: { processedAt: { lt: auditBefore } },
    });
    await this.prisma.scooterDocumentJob.updateMany({
      where: { session: { expiresAt: { lt: now } } },
      data: { result: Prisma.DbNull },
    });
    const [pending, uncertain, failures] = await Promise.all([
      this.prisma.scooterDocumentResource.count({
        where: {
          status: "cleanup_pending",
          createdAt: { lt: new Date(Date.now() - 60 * 60_000) },
        },
      }),
      this.prisma.scooterDocumentJob.count({
        where: { submissionUncertainAt: { not: null } },
      }),
      this.prisma.scooterDocumentResource.count({
        where: { errorCode: { not: null } },
      }),
    ]);
    if (pending || uncertain || failures)
      this.logger.warn(
        `Document cleanup backlog pending=${pending} failures=${failures} uncertainSubmissions=${uncertain}`,
      );
  }

  private async claim(candidate: ScooterDocumentResource) {
    return this.prisma.$transaction(async (tx) => {
      if (candidate.sessionId) await lockEditorSession(tx, candidate.sessionId);
      const now = new Date();
      const resource = await tx.scooterDocumentResource.findFirst({
        where: {
          id: candidate.id,
          status: { not: "retained" },
          cleanupAfter: { lte: now },
          lastPossibleWriteAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
      });
      if (!resource) return null;
      if (resource.kind === "original") {
        const draft = resource.draftUploadId
          ? await tx.draftUpload.findUnique({
              where: { id: resource.draftUploadId },
            })
          : null;
        if (!draft) {
          // A missing ownership ledger is not permission to delete a potentially saved original.
          await tx.scooterDocumentResource.update({
            where: { id: resource.id },
            data: {
              errorCode: "ORIGINAL_OWNERSHIP_MISSING",
              cleanupAfter: new Date(Date.now() + 60 * 60_000),
            },
          });
          return null;
        }
        if (draft.claimedAt) {
          await tx.scooterDocumentResource.update({
            where: { id: resource.id },
            data: { status: "retained" },
          });
          return null;
        }
        if (draft.processingUntil && draft.processingUntil > now) return null;
        const session = candidate.sessionId
          ? await tx.scooterDocumentEditorSession.findUnique({
              where: { id: candidate.sessionId },
            })
          : null;
        if (draft.expiresAt > now && session?.status === "open") return null;
        // This is the same attachment/cleanup mutex as the legacy upload lifecycle.
        const changed = await tx.draftUpload.updateMany({
          where: { id: draft.id, claimedAt: null },
          data: { cleanupStartedAt: now },
        });
        if (!changed.count) return null;
      }
      if (resource.jobId) {
        const job = await tx.scooterDocumentJob.findUnique({
          where: { id: resource.jobId },
        });
        if (
          job &&
          ACTIVE_JOB_STATES.includes(job.status) &&
          !job.cancellationAt &&
          job.expiresAt > now
        )
          return null;
      }
      const leaseId = randomUUID();
      const changed = await tx.scooterDocumentResource.updateMany({
        where: {
          id: resource.id,
          status: { not: "retained" },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
          status: "cleanup_pending",
          leaseId,
          leaseUntil: new Date(Date.now() + WORKER_LEASE_MS),
          attempts: { increment: 1 },
        },
      });
      if (!changed.count) return null;
      return { ...resource, leaseId };
    });
  }

  async clean(candidate: ScooterDocumentResource) {
    const resource = await this.claim(candidate);
    if (!resource) return;
    try {
      if (resource.kind === "provider") {
        if (!resource.providerId) throw new Error("Missing provider identity");
        let response = await this.provider.retrieve(resource.providerId);
        if (["queued", "in_progress"].includes(response.status)) {
          await this.provider.cancel(resource.providerId);
          response = await this.provider.retrieve(resource.providerId);
        }
        if (["queued", "in_progress"].includes(response.status))
          throw new Error("Cancellation pending");
        if (!response.missing) await this.provider.delete(resource.providerId);
      } else {
        if (
          !resource.storageKey ||
          resource.bucket !== this.env.IMAGE_STORAGE_S3_BUCKET
        )
          throw new Error("Storage ownership mismatch");
        await this.storage.deleteDocumentForCleanup(resource.storageKey);
      }
      await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.scooterDocumentResource.updateMany({
          where: { id: resource.id, leaseId: resource.leaseId },
          data: {
            status: "deleted",
            deletedAt: resource.deletedAt ?? new Date(),
            leaseId: null,
            leaseUntil: null,
            errorCode: null,
            // Tombstones periodically re-delete late PUT/Lambda writes, without losing provenance.
            cleanupAfter: new Date(
              Date.now() +
                (resource.kind === "provider"
                  ? AUDIT_RETENTION_MS
                  : 60 * 60_000),
            ),
          },
        });
        if (deleted.count && resource.draftUploadId)
          await tx.draftUpload.updateMany({
            where: { id: resource.draftUploadId, claimedAt: null },
            data: { cleanedAt: new Date() },
          });
      });
    } catch {
      await this.prisma.scooterDocumentResource.updateMany({
        where: { id: resource.id, leaseId: resource.leaseId },
        data: {
          status: "cleanup_pending",
          leaseId: null,
          leaseUntil: null,
          errorCode: "EXTERNAL_CLEANUP_FAILED",
          cleanupAfter: new Date(
            Date.now() +
              Math.min(
                60 * 60_000,
                30_000 * 2 ** Math.min(resource.attempts, 7),
              ),
          ),
        },
      });
    }
  }

  private async reconcileTemporaryObjects() {
    if (
      this.env.NODE_ENV !== "production" &&
      this.env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER === "fake"
    )
      return;
    // Persist the cursor so a bounded pass eventually covers large buckets across restarts.
    const cursor = await this.prisma.scooterDocumentReconciliationCursor.upsert(
      { where: { id: "temporary" }, create: { id: "temporary" }, update: {} },
    );
    const page = await this.storage.listDocumentAnalysisObjects({
      continuationToken: cursor.continuationToken ?? undefined,
      maxKeys: 100,
    });
    const agedBefore = new Date(Date.now() - SESSION_LIFETIME_MS);
    for (const object of page.objects) {
      if (!object.lastModified || object.lastModified > agedBefore) continue;
      const identity = `s3:${this.env.IMAGE_STORAGE_S3_BUCKET}:${object.storageKey}`;
      await this.prisma.scooterDocumentResource.upsert({
        where: { identity },
        create: {
          identity,
          kind: "temporary",
          bucket: this.env.IMAGE_STORAGE_S3_BUCKET,
          storageKey: object.storageKey,
          lastPossibleWriteAt: object.lastModified,
          cleanupAfter: new Date(),
          status: "cleanup_pending",
        },
        update: {},
      });
    }
    await this.prisma.scooterDocumentReconciliationCursor.update({
      where: { id: "temporary" },
      data: { continuationToken: page.continuationToken ?? null },
    });
  }
}
