import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { createHash } from "node:crypto";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { Prisma, type ScooterDocumentJob } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScooterDocumentsService } from "../scooters/scooter-documents.service";
import {
  ACTIVE_JOB_STATES,
  JOB_LIFETIME_MS,
  SESSION_LIFETIME_MS,
  jsonValue,
  lockEditorSession,
  requireOpenEditorSession,
} from "./document-job-lifecycle";

@Injectable()
export class ScooterDocumentJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: ScooterDocumentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async createSession(userId: string) {
    const session = await this.prisma.scooterDocumentEditorSession.create({
      data: { userId, expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) },
    });
    return { id: session.id, expiresAt: session.expiresAt.toISOString() };
  }

  async start(
    input: v1.scooters.StartScooterDocumentExtractionJobInput,
    userId: string,
  ) {
    const requestBinding = createHash("sha256")
      .update(JSON.stringify(input.source))
      .digest("hex");
    const prior = await this.prisma.scooterDocumentJob.findUnique({
      where: { userId_attemptId: { userId, attemptId: input.attemptId } },
    });
    if (
      prior &&
      prior.sessionId === input.sessionId &&
      prior.sourceId === input.sourceId &&
      prior.requestBinding === requestBinding
    )
      return this.status(prior.id, userId);
    if (!this.env.SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED)
      throw new ServiceUnavailableException({
        code: "DOCUMENT_EXTRACTION_DISABLED",
        message: "Document extraction is disabled.",
      });
    const source = await this.documents.resolveAnalysisSource(
      input.source,
      userId,
    );
    const fingerprint =
      source.stored.checksumSha256 + ":" + source.stored.storageKey;
    const job = await this.prisma.$transaction(async (tx) => {
      const session = await requireOpenEditorSession(
        tx,
        input.sessionId,
        userId,
      );
      // One lock serializes global/per-owner admission, including multiple API dynos.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('scooter-document-job-admission'))::text`;
      const existing = await tx.scooterDocumentJob.findUnique({
        where: { userId_attemptId: { userId, attemptId: input.attemptId } },
      });
      if (existing) {
        if (
          existing.sessionId !== session.id ||
          existing.sourceFingerprint !== fingerprint ||
          existing.sourceId !== input.sourceId
        )
          throw new BadRequestException(
            "The extraction attempt belongs to a different source.",
          );
        return existing;
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + JOB_LIFETIME_MS);
      if (session.expiresAt <= expiresAt)
        throw new BadRequestException(
          "Document editor session is about to expire.",
        );
      if (source.draftUploadId) {
        const available = await tx.draftUpload.updateMany({
          where: {
            id: source.draftUploadId,
            userId,
            editorSessionId: session.id,
            claimedAt: null,
            cleanupStartedAt: null,
            expiresAt: { gt: expiresAt },
          },
          data: { processingUntil: expiresAt },
        });
        if (available.count !== 1)
          throw new BadRequestException(
            "Document upload is unavailable or belongs to another editor.",
          );
      }
      const where = {
        OR: [
          { status: { in: ACTIVE_JOB_STATES }, expiresAt: { gt: now } },
          // Unknown remote acceptance must not become a way to bypass paid-work limits.
          { submissionUncertainAt: { not: null } },
        ],
      };
      const [globalCount, userCount] = await Promise.all([
        tx.scooterDocumentJob.count({ where }),
        tx.scooterDocumentJob.count({ where: { ...where, userId } }),
      ]);
      if (globalCount >= 4 || userCount >= 2)
        throw new HttpException(
          {
            code: "DOCUMENT_EXTRACTION_THROTTLED",
            message: "Too many active document extractions.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      return tx.scooterDocumentJob.create({
        data: {
          userId,
          sessionId: session.id,
          attemptId: input.attemptId,
          sourceId: input.sourceId,
          documentType: source.documentType,
          draftUploadId: source.draftUploadId,
          documentId: source.documentId,
          scooterId: source.scooterId,
          sourceFingerprint: fingerprint,
          requestBinding,
          source: jsonValue(source.stored),
          model: this.env.SCOOTER_DOCUMENT_EXTRACTION_MODEL,
          promptVersion: "scooter-v1-direct-url",
          expiresAt,
        },
      });
    });
    return this.present(job);
  }

  async status(id: string, userId: string) {
    const job = await this.ownedJob(id, userId);
    const session = await this.prisma.scooterDocumentEditorSession.findUnique({
      where: { id: job.sessionId },
    });
    if (
      session &&
      session.expiresAt <= new Date() &&
      ["open", "saved"].includes(session.status)
    ) {
      await this.closeSession(session.id, "expired");
      return this.present(await this.ownedJob(id, userId));
    }
    if (ACTIVE_JOB_STATES.includes(job.status) && job.expiresAt <= new Date()) {
      await this.prisma.scooterDocumentJob.updateMany({
        where: { id, status: { in: ACTIVE_JOB_STATES } },
        data: {
          status: "expired",
          cancellationAt: new Date(),
          result: Prisma.DbNull,
        },
      });
      return this.present(await this.ownedJob(id, userId));
    }
    return this.present(job);
  }

  async cancel(id: string, userId: string) {
    const job = await this.ownedJob(id, userId);
    await this.prisma.$transaction(async (tx) => {
      await lockEditorSession(tx, job.sessionId);
      await tx.scooterDocumentJob.updateMany({
        where: { id, userId },
        data: {
          status: "cancelled",
          cancellationAt: new Date(),
          result: Prisma.DbNull,
          nextRunAt: new Date(),
        },
      });
      await tx.scooterDocumentResource.updateMany({
        where: { jobId: id, status: { notIn: ["deleted", "retained"] } },
        data: { status: "cleanup_pending", cleanupAfter: new Date() },
      });
    });
    return this.present(await this.ownedJob(id, userId));
  }

  async discardSession(id: string, userId: string) {
    const session = await this.prisma.scooterDocumentEditorSession.findFirst({
      where: { id, userId },
    });
    if (!session)
      throw new NotFoundException("Document editor session not found.");
    await this.closeSession(id, "discarded", userId);
    return { ok: true as const };
  }

  async closeSession(
    id: string,
    state: "discarded" | "expired",
    userId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await lockEditorSession(tx, id);
      // An editor unmount after successful save must not undo the committed session.
      const changed = await tx.scooterDocumentEditorSession.updateMany({
        where: {
          id,
          ...(userId ? { userId } : {}),
          status: state === "discarded" ? "open" : { in: ["open", "saved"] },
          ...(state === "expired" ? { expiresAt: { lte: new Date() } } : {}),
        },
        data: { status: state },
      });
      if (!changed.count) return;
      const now = new Date();
      await tx.scooterDocumentJob.updateMany({
        where: { sessionId: id },
        data: {
          status: state === "expired" ? "expired" : "cancelled",
          cancellationAt: now,
          result: Prisma.DbNull,
          nextRunAt: now,
        },
      });
      await tx.scooterDocumentResource.updateMany({
        where: { sessionId: id, status: { notIn: ["deleted", "retained"] } },
        data: { status: "cleanup_pending", cleanupAfter: now },
      });
      // Exclude abandoned uploads from attachment immediately, even before a cleanup worker runs.
      await tx.draftUpload.updateMany({
        where: { editorSessionId: id, claimedAt: null, cleanupStartedAt: null },
        data: { cleanupStartedAt: now },
      });
    });
  }

  async recordProviderEvent(eventId: string, responseId: string) {
    await this.prisma.scooterDocumentProviderEvent.upsert({
      where: { id: eventId },
      create: { id: eventId, responseId },
      update: {},
    });
  }

  private async ownedJob(id: string, userId: string) {
    const job = await this.prisma.scooterDocumentJob.findFirst({
      where: { id, userId },
    });
    if (!job) throw new NotFoundException("Document extraction not found.");
    if (job.documentId) {
      const document = await this.prisma.scooterDocument.findFirst({
        where: {
          id: job.documentId,
          scooterId: job.scooterId!,
          deletedAt: null,
          scooter: { deletedAt: null },
          asset: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!document)
        throw new NotFoundException(
          "Document extraction source is unavailable.",
        );
    }
    return job;
  }

  present(job: ScooterDocumentJob): v1.scooters.ScooterDocumentExtractionJob {
    return v1.scooters.scooterDocumentExtractionJobSchema.parse({
      id: job.id,
      sourceId: job.sourceId,
      documentType: job.documentType,
      status: job.status,
      ...(job.status === "completed" ? { result: job.result } : {}),
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      ...(ACTIVE_JOB_STATES.includes(job.status) ? { retryAfterMs: 2000 } : {}),
      expiresAt: job.expiresAt.toISOString(),
    });
  }
}
