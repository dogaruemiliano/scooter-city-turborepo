import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { randomUUID } from "node:crypto";
import { v1 } from "@repo/api-shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DocumentValidationService } from "../document-validation/document-validation.service";
import { Prisma, type ScooterDocumentJob } from "../generated/prisma/client";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  OpenAiScooterDocumentJobProvider,
  type ScooterProviderJob,
} from "../scooter-document-extraction/openai-scooter-document-job.provider";
import { ScooterDocumentExtractionService } from "../scooter-document-extraction/scooter-document-extraction.service";
import {
  ACTIVE_JOB_STATES,
  VALIDATION_WRITE_GRACE_MS,
  WORKER_LEASE_MS,
  jsonValue,
  lockEditorSession,
  safeErrorCode,
} from "./document-job-lifecycle";

@Injectable()
export class ScooterDocumentDispatcherService {
  private readonly logger = new Logger(ScooterDocumentDispatcherService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorageService,
    private readonly validation: DocumentValidationService,
    private readonly provider: OpenAiScooterDocumentJobProvider,
    private readonly extraction: ScooterDocumentExtractionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Cron("*/5 * * * * *", {
    name: "scooter-document-dispatch",
    waitForCompletion: true,
  })
  async tick() {
    try {
      await this.runOnce();
    } catch {
      this.logger.warn(
        "Document dispatcher failed; durable work remains queued.",
      );
    }
  }

  async runOnce() {
    const now = new Date();
    await this.prisma.scooterDocumentJob.updateMany({
      where: { status: { in: ACTIVE_JOB_STATES }, expiresAt: { lte: now } },
      data: { status: "expired", cancellationAt: now, result: Prisma.DbNull },
    });
    const jobs = await this.prisma.scooterDocumentJob.findMany({
      where: {
        status: { in: ["queued", "validating", "submitting", "running"] },
        nextRunAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: 4,
    });
    // Globally admitted work is bounded in start(); each operation also needs a DB lease.
    await Promise.all([
      this.processEvents(),
      ...jobs.map((job) => this.process(job)),
    ]);
  }

  private async claim(candidate: ScooterDocumentJob) {
    return this.prisma.$transaction(async (tx) => {
      await lockEditorSession(tx, candidate.sessionId);
      const now = new Date();
      const job = await tx.scooterDocumentJob.findFirst({
        where: {
          id: candidate.id,
          cancellationAt: null,
          expiresAt: { gt: now },
          status: { in: ["queued", "validating", "submitting", "running"] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        include: { session: true },
      });
      if (!job) return null;
      if (
        !["open", "saved"].includes(job.session.status) ||
        job.session.expiresAt <= now ||
        (job.session.status === "saved" && !job.documentId)
      ) {
        await tx.scooterDocumentJob.update({
          where: { id: job.id },
          data: {
            status: "cancelled",
            cancellationAt: now,
            result: Prisma.DbNull,
          },
        });
        return null;
      }
      if (
        job.documentId &&
        !(await tx.scooterDocument.findFirst({
          where: {
            id: job.documentId,
            deletedAt: null,
            scooter: { deletedAt: null },
            asset: { deletedAt: null },
          },
          select: { id: true },
        }))
      ) {
        await tx.scooterDocumentJob.update({
          where: { id: job.id },
          data: { status: "cancelled", cancellationAt: now },
        });
        return null;
      }
      if (job.status === "submitting") {
        // A crashed submitter may have created paid work. Never automatically resubmit it.
        await tx.scooterDocumentJob.update({
          where: { id: job.id },
          data: {
            status: job.submissionUncertainAt ? "submission_unknown" : "failed",
            errorCode: "DOCUMENT_EXTRACTION_UNAVAILABLE",
            leaseId: null,
            leaseUntil: null,
          },
        });
        return null;
      }
      if (job.status === "validating") {
        // The invocation can still write until its reserved write window closes.
        await tx.scooterDocumentJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            errorCode: "DOCUMENT_EXTRACTION_UNAVAILABLE",
            leaseId: null,
            leaseUntil: null,
          },
        });
        return null;
      }
      if (
        job.status === "queued" &&
        !this.env.SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED
      ) {
        await tx.scooterDocumentJob.update({
          where: { id: job.id },
          data: { status: "failed", errorCode: "DOCUMENT_EXTRACTION_DISABLED" },
        });
        return null;
      }
      const status =
        job.status === "running"
          ? "running"
          : job.validatedSource
            ? "submitting"
            : "validating";
      if (status === "validating") {
        const source = job.source as unknown as StoredDocument;
        const key = this.storage.createDocumentAnalysisKey(job.id);
        const lastPossibleWriteAt = new Date(
          now.getTime() + VALIDATION_WRITE_GRACE_MS,
        );
        await tx.scooterDocumentResource.create({
          data: {
            identity: `s3:${source.bucket}:${key}`,
            sessionId: job.sessionId,
            jobId: job.id,
            kind: "temporary",
            bucket: source.bucket,
            storageKey: key,
            lastPossibleWriteAt,
            cleanupAfter: job.expiresAt,
          },
        });
      }
      return tx.scooterDocumentJob.update({
        where: { id: job.id },
        data: {
          status,
          leaseId: randomUUID(),
          leaseUntil: new Date(now.getTime() + WORKER_LEASE_MS),
        },
      });
    });
  }

  async process(candidate: ScooterDocumentJob) {
    const job = await this.claim(candidate);
    if (!job) return;
    let attemptedProviderSubmission = false;
    try {
      if (job.status === "validating") {
        const source = job.source as unknown as StoredDocument;
        const output = await this.validation.validate({
          source,
          outputKey: this.storage.createDocumentAnalysisKey(job.id),
        });
        await this.prisma.scooterDocumentJob.updateMany({
          where: {
            id: job.id,
            leaseId: job.leaseId,
            status: "validating",
            cancellationAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            validatedSource: jsonValue({ ...source, ...output }),
            status: "queued",
            leaseId: null,
            leaseUntil: null,
            nextRunAt: new Date(),
          },
        });
      } else if (job.status === "submitting") {
        const source = job.validatedSource as unknown as StoredDocument;
        const url =
          this.env.NODE_ENV !== "production" &&
          this.env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER === "fake"
            ? "https://synthetic.invalid/document"
            : await this.storage.createDocumentReadUrl(source, 600);
        // Persist uncertainty BEFORE crossing the external boundary. Cancellation or
        // a dyno crash cannot erase the fact that a request might have been accepted.
        const submitting = await this.prisma.scooterDocumentJob.updateMany({
          where: {
            id: job.id,
            leaseId: job.leaseId,
            status: "submitting",
            cancellationAt: null,
            expiresAt: { gt: new Date() },
            providerResponseId: null,
          },
          data: { submissionUncertainAt: new Date() },
        });
        if (!submitting.count) return;
        attemptedProviderSubmission = true;
        const response = await this.provider.start({
          jobId: job.id,
          documentType: job.documentType ?? "unclassified",
          url,
          contentType: source.contentType,
        });
        await this.recordResponse(job.id, response.id);
      } else if (job.providerResponseId) {
        await this.acceptProviderResult(
          job,
          await this.provider.retrieve(job.providerResponseId),
        );
      }
    } catch (error) {
      const uncertain =
        attemptedProviderSubmission &&
        !(error as { submissionRejected?: boolean } | null)?.submissionRejected;
      if (attemptedProviderSubmission && !uncertain) {
        await this.prisma.scooterDocumentJob.updateMany({
          where: { id: job.id, leaseId: job.leaseId, providerResponseId: null },
          data: { submissionUncertainAt: null },
        });
      }
      await this.prisma.scooterDocumentJob.updateMany({
        where: {
          id: job.id,
          leaseId: job.leaseId,
          status: job.status,
          ...(uncertain ? { providerResponseId: null } : {}),
        },
        data: uncertain
          ? {
              status: "submission_unknown",
              submissionUncertainAt: new Date(),
              errorCode: safeErrorCode(error),
              leaseId: null,
              leaseUntil: null,
            }
          : job.status === "running"
            ? {
                nextRunAt: new Date(Date.now() + 5000),
                leaseId: null,
                leaseUntil: null,
                errorCode: safeErrorCode(error),
              }
            : {
                status: "failed",
                errorCode: safeErrorCode(error),
                leaseId: null,
                leaseUntil: null,
              },
      });
    }
  }

  async recordResponse(jobId: string, responseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.scooterDocumentJob.findUnique({
        where: { id: jobId },
      });
      if (!existing) return null;
      await lockEditorSession(tx, existing.sessionId);
      const job = await tx.scooterDocumentJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      const usable =
        ACTIVE_JOB_STATES.includes(job.status) &&
        !job.cancellationAt &&
        job.expiresAt > new Date() &&
        (!job.providerResponseId || job.providerResponseId === responseId);
      await tx.scooterDocumentResource.upsert({
        where: { identity: `openai:${responseId}` },
        create: {
          identity: `openai:${responseId}`,
          sessionId: job.sessionId,
          jobId,
          kind: "provider",
          providerId: responseId,
          status: usable ? "reserved" : "cleanup_pending",
          lastPossibleWriteAt: new Date(),
          cleanupAfter: usable ? job.expiresAt : new Date(),
        },
        update: {},
      });
      if (usable)
        return tx.scooterDocumentJob.update({
          where: { id: jobId },
          data: {
            providerResponseId: responseId,
            status: "running",
            submissionUncertainAt: null,
            leaseId: null,
            leaseUntil: null,
            nextRunAt: new Date(),
            errorCode: null,
          },
        });
      if (!job.providerResponseId)
        await tx.scooterDocumentJob.update({
          where: { id: jobId },
          data: { providerResponseId: responseId, submissionUncertainAt: null },
        });
      return job;
    });
  }

  async acceptProviderResult(
    job: ScooterDocumentJob,
    response: ScooterProviderJob,
  ) {
    if (!ACTIVE_JOB_STATES.includes(job.status) || job.cancellationAt) return;
    let status = "running";
    let errorCode: string | null = null;
    let result: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    if (response.status === "completed" && !response.errorCode) {
      try {
        const documentType =
          job.documentType ?? this.extraction.detectType(response.output);
        const normalized = this.extraction.normalize(
          documentType,
          response.output,
        );
        result = jsonValue(
          v1.scooters.scooterDocumentAnalysisSchema.parse({
            ...normalized,
            sourceId: job.sourceId,
            documentType,
            reviewRequired: true,
          }),
        );
        status = "completed";
      } catch (error) {
        status = "failed";
        errorCode =
          error instanceof DocumentExtractionError
            ? error.code
            : "DOCUMENT_EXTRACTION_FAILED";
      }
    } else if (!["queued", "in_progress"].includes(response.status)) {
      status = response.status === "cancelled" ? "cancelled" : "failed";
      errorCode = response.errorCode ?? "DOCUMENT_EXTRACTION_FAILED";
    }
    await this.prisma.$transaction(async (tx) => {
      await lockEditorSession(tx, job.sessionId);
      const updated = await tx.scooterDocumentJob.updateMany({
        where: {
          id: job.id,
          status: { in: ACTIVE_JOB_STATES },
          cancellationAt: null,
          expiresAt: { gt: new Date() },
          providerResponseId: response.id,
        },
        data: {
          status,
          result,
          errorCode,
          leaseId: null,
          leaseUntil: null,
          nextRunAt: new Date(Date.now() + 5000),
        },
      });
      if (updated.count && status !== "running")
        await tx.scooterDocumentResource.updateMany({
          where: { jobId: job.id, status: { notIn: ["deleted", "retained"] } },
          data: { status: "cleanup_pending", cleanupAfter: new Date() },
        });
    });
  }

  private async processEvents() {
    const now = new Date();
    const events = await this.prisma.scooterDocumentProviderEvent.findMany({
      where: {
        processedAt: null,
        nextRunAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: "asc" },
      take: 4,
    });
    await Promise.all(
      events.map(async (event) => {
        const leaseId = randomUUID();
        const claim = await this.prisma.scooterDocumentProviderEvent.updateMany(
          {
            where: {
              id: event.id,
              processedAt: null,
              OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
            },
            data: {
              leaseId,
              leaseUntil: new Date(Date.now() + WORKER_LEASE_MS),
              attempts: { increment: 1 },
            },
          },
        );
        if (!claim.count) return;
        try {
          const response = await this.provider.retrieve(event.responseId);
          const known = await this.prisma.scooterDocumentJob.findFirst({
            where: {
              OR: [
                { providerResponseId: event.responseId },
                ...(response.jobId ? [{ id: response.jobId }] : []),
              ],
            },
          });
          if (!known) {
            // Never erase an uncorrelated response ID: it may be the lost submission acknowledgement.
            await this.prisma.scooterDocumentProviderEvent.updateMany({
              where: { id: event.id, leaseId },
              data: {
                errorCode: "UNRESOLVED_PROVIDER_RESPONSE",
                leaseId: null,
                leaseUntil: null,
                nextRunAt: new Date(Date.now() + 60_000),
              },
            });
            return;
          }
          const job = await this.recordResponse(known.id, event.responseId);
          if (job) await this.acceptProviderResult(job, response);
          await this.prisma.scooterDocumentProviderEvent.updateMany({
            where: { id: event.id, leaseId },
            data: {
              processedAt: new Date(),
              leaseId: null,
              leaseUntil: null,
              errorCode: null,
            },
          });
        } catch {
          await this.prisma.scooterDocumentProviderEvent.updateMany({
            where: { id: event.id, leaseId },
            data: {
              leaseId: null,
              leaseUntil: null,
              nextRunAt: new Date(Date.now() + 30_000),
              errorCode: "PROVIDER_RECONCILIATION_FAILED",
            },
          });
        }
      }),
    );
  }
}
