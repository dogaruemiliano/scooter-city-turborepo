import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  Optional,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { createHash } from "node:crypto";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import {
  Prisma,
  type ScooterDocumentJob,
  type ScooterDocumentEditorSession,
} from "../generated/prisma/client";
import { ImageStorageService } from "../image-storage/image-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { ScooterDocumentsService } from "../scooters/scooter-documents.service";
import { SCOOTER_DOCUMENT_EXTRACTION_PROMPT_VERSION } from "../scooter-document-extraction/scooter-document-extraction.prompt";
import {
  ACTIVE_JOB_STATES,
  MAX_GLOBAL_PENDING_JOBS,
  MAX_USER_PENDING_JOBS,
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
    @Optional() private readonly storage?: ImageStorageService,
  ) {}

  async createSession(userId: string) {
    const session = await this.prisma.scooterDocumentEditorSession.create({
      data: { userId, expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) },
    });
    return { id: session.id, expiresAt: session.expiresAt.toISOString() };
  }

  async createImportDraft(userId: string) {
    const draft = await this.prisma.$transaction(async (tx) => {
      // A user-scoped mutex makes the 20-draft cap reliable across API instances.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('scooter-import-drafts'), hashtext(${userId}))::text`;
      const count = await tx.scooterDocumentEditorSession.count({
        where: {
          userId,
          isImportDraft: true,
          status: "open",
          expiresAt: { gt: new Date() },
        },
      });
      if (count >= v1.scooters.SCOOTER_IMPORT_MAX_DRAFTS)
        throw new ConflictException({
          code: "IMPORT_DRAFT_LIMIT_REACHED",
          message: "Create or discard a scooter before starting another draft.",
        });
      return tx.scooterDocumentEditorSession.create({
        data: {
          userId,
          isImportDraft: true,
          expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
        },
      });
    });
    return this.presentImportDraft(draft);
  }

  async listImportDrafts(userId: string) {
    const drafts = await this.prisma.scooterDocumentEditorSession.findMany({
      where: {
        userId,
        isImportDraft: true,
        status: "open",
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: v1.scooters.SCOOTER_IMPORT_MAX_DRAFTS,
    });
    return { items: drafts.map((draft) => this.presentImportDraft(draft)) };
  }

  async getImportDraft(id: string, userId: string) {
    const draft = await this.prisma.scooterDocumentEditorSession.findFirst({
      where: {
        id,
        userId,
        isImportDraft: true,
        status: "open",
        expiresAt: { gt: new Date() },
      },
    });
    if (!draft) throw new NotFoundException("Scooter import draft not found.");
    return this.presentImportDraft(draft);
  }

  async updateImportDraft(
    id: string,
    input: v1.scooters.UpdateScooterImportDraftInput,
    userId: string,
  ) {
    // Validate snapshots here as well as at the HTTP boundary for internal callers.
    const update = v1.scooters.updateScooterImportDraftSchema.parse(input);
    const draft = await this.prisma.$transaction(async (tx) => {
      const current = await requireOpenEditorSession(tx, id, userId);
      if (!current.isImportDraft)
        throw new NotFoundException("Scooter import draft not found.");
      if (current.revision !== update.revision)
        throw new ConflictException({
          code: "IMPORT_DRAFT_REVISION_CONFLICT",
          message:
            "This draft changed in another window. Reload it before editing.",
        });
      return tx.scooterDocumentEditorSession.update({
        where: { id },
        data: {
          editorState: jsonValue(update.state),
          revision: { increment: 1 },
        },
      });
    });
    return this.presentImportDraft(draft);
  }

  /** Consolidate completed files for one vehicle without re-uploading or paying for analysis again. */
  async mergeImportDraft(
    id: string,
    input: v1.scooters.MergeScooterImportDraftInput,
    userId: string,
  ) {
    const merge = v1.scooters.mergeScooterImportDraftSchema.parse(input);
    if (id === merge.sourceId)
      throw new BadRequestException("Choose different drafts.");
    const draft = await this.prisma.$transaction(async (tx) => {
      // Stable lock order prevents concurrent opposite-direction merges deadlocking.
      const sessions = new Map<string, ScooterDocumentEditorSession>();
      for (const sessionId of [id, merge.sourceId].sort())
        sessions.set(
          sessionId,
          await requireOpenEditorSession(tx, sessionId, userId),
        );
      const target = sessions.get(id)!;
      const source = sessions.get(merge.sourceId)!;
      if (!target.isImportDraft || !source.isImportDraft)
        throw new NotFoundException("Scooter import draft not found.");
      if (
        target.revision !== merge.revision ||
        source.revision !== merge.sourceRevision
      )
        throw new ConflictException({
          code: "IMPORT_DRAFT_REVISION_CONFLICT",
          message: "A draft changed before grouping. Reload before continuing.",
        });
      if (
        await tx.scooterDocumentJob.count({
          where: {
            sessionId: { in: [id, merge.sourceId] },
            OR: [
              { status: { in: ACTIVE_JOB_STATES } },
              { submissionUncertainAt: { not: null } },
            ],
          },
        })
      )
        throw new ConflictException({
          code: "IMPORT_DRAFT_BUSY",
          message: "Wait for both drafts to finish analysis before grouping.",
        });
      await tx.draftUpload.updateMany({
        where: {
          editorSessionId: source.id,
          userId,
          claimedAt: null,
          cleanupStartedAt: null,
        },
        data: { editorSessionId: id },
      });
      await tx.scooterDocumentResource.updateMany({
        where: { sessionId: source.id },
        data: { sessionId: id },
      });
      await tx.scooterDocumentJob.updateMany({
        where: { sessionId: source.id },
        data: { sessionId: id },
      });
      await tx.scooterDocumentEditorSession.update({
        where: { id: source.id },
        data: {
          status: "discarded",
          editorState: {},
          revision: { increment: 1 },
        },
      });
      return tx.scooterDocumentEditorSession.update({
        where: { id },
        data: {
          editorState: jsonValue(merge.state),
          revision: { increment: 1 },
        },
      });
    });
    return this.presentImportDraft(draft);
  }

  async discardImportDraft(id: string, userId: string) {
    // Refuse ordinary editor sessions on this import-specific endpoint.
    await this.getImportDraft(id, userId);
    return this.discardSession(id, userId);
  }

  async importDraftDocumentContent(
    id: string,
    input: v1.scooters.AnalyzeScooterDocumentInput,
    userId: string,
  ) {
    if (input.source.kind !== "draft")
      throw new BadRequestException("An uploaded draft document is required.");
    const source = await this.documents.resolveAnalysisSource(
      input.source,
      userId,
    );
    await this.prisma.$transaction(async (tx) => {
      const draft = await requireOpenEditorSession(tx, id, userId);
      if (
        !draft.isImportDraft ||
        !source.draftUploadId ||
        !(await tx.draftUpload.findFirst({
          where: {
            id: source.draftUploadId,
            editorSessionId: id,
            userId,
            claimedAt: null,
            cleanupStartedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Scooter import document not found.");
    });
    if (!this.storage) throw new ServiceUnavailableException();
    return {
      ...(await this.storage.readDocument(source.stored.storageKey)),
      contentType: source.stored.contentType,
    };
  }

  private presentImportDraft(draft: ScooterDocumentEditorSession) {
    return v1.scooters.scooterImportDraftSchema.parse({
      id: draft.id,
      expiresAt: draft.expiresAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
      revision: draft.revision,
      state: draft.editorState,
    });
  }

  async importDraftPhotoContent(
    id: string,
    uploadToken: string,
    userId: string,
  ) {
    await this.getImportDraft(id, userId);
    if (!this.storage) throw new ServiceUnavailableException();
    // Use exactly the same signed scope and metadata validation as photo attachment.
    const source = await this.storage.completePresignedUpload(
      uploadToken,
      `scooter-photo-draft:${userId}`,
    );
    await this.prisma.$transaction(async (tx) => {
      const draft = await requireOpenEditorSession(tx, id, userId);
      if (
        !draft.isImportDraft ||
        !(await tx.draftUpload.findFirst({
          where: {
            userId,
            purpose: "scooter-photo-draft",
            storageKey: source.storageKey,
            provider: source.provider,
            bucket: source.bucket,
            contentType: source.contentType,
            byteSize: source.byteSize,
            checksumSha256: source.checksumSha256,
            claimedAt: null,
            cleanupStartedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Scooter import photo not found.");
    });
    return {
      ...(await this.storage.readImage(source.storageKey)),
      contentType: source.contentType,
    };
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
      // Admission bounds stored waiting work; execution limits are leased at dispatch.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('scooter-document-job-admission'))::text`;
      const existing = await tx.scooterDocumentJob.findUnique({
        where: { userId_attemptId: { userId, attemptId: input.attemptId } },
      });
      if (existing) {
        if (
          existing.sessionId !== session.id ||
          existing.sourceFingerprint !== fingerprint ||
          existing.sourceId !== input.sourceId ||
          existing.requestBinding !== requestBinding
        )
          throw new BadRequestException(
            "The extraction attempt belongs to a different source.",
          );
        return existing;
      }
      const now = new Date();
      const expiresAt = session.expiresAt;
      if (source.draftUploadId) {
        const available = await tx.draftUpload.updateMany({
          where: {
            id: source.draftUploadId,
            userId,
            editorSessionId: session.id,
            claimedAt: null,
            cleanupStartedAt: null,
            expiresAt: { gte: expiresAt },
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
      if (
        globalCount >= MAX_GLOBAL_PENDING_JOBS ||
        userCount >= MAX_USER_PENDING_JOBS
      )
        throw new HttpException(
          {
            code: "DOCUMENT_EXTRACTION_THROTTLED",
            message: "The document analysis queue is full. Try again shortly.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      return tx.scooterDocumentJob.create({
        data: {
          userId,
          sessionId: session.id,
          attemptId: input.attemptId,
          sourceId: input.sourceId,
          documentType:
            source.documentType === "unclassified" ? null : source.documentType,
          draftUploadId: source.draftUploadId,
          documentId: source.documentId,
          scooterId: source.scooterId,
          sourceFingerprint: fingerprint,
          requestBinding,
          source: jsonValue(source.stored),
          model: this.env.SCOOTER_DOCUMENT_EXTRACTION_MODEL,
          promptVersion: SCOOTER_DOCUMENT_EXTRACTION_PROMPT_VERSION,
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
        data: { status: state, editorState: {} },
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
        data: { cleanupStartedAt: now, processingUntil: null },
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
      documentType: job.documentType ?? "unclassified",
      status: job.status,
      ...(job.status === "completed" ? { result: job.result } : {}),
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      ...(ACTIVE_JOB_STATES.includes(job.status) ? { retryAfterMs: 2000 } : {}),
      expiresAt: job.expiresAt.toISOString(),
    });
  }
}
