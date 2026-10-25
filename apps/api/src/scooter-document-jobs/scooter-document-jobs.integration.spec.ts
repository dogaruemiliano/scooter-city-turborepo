import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { Env } from "../config/env";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";
import type { DocumentValidationService } from "../document-validation/document-validation.service";
import type { OpenAiScooterDocumentJobProvider } from "../scooter-document-extraction/openai-scooter-document-job.provider";
import { ScooterDocumentExtractionService } from "../scooter-document-extraction/scooter-document-extraction.service";
import { ScooterDocumentsService } from "../scooters/scooter-documents.service";
import { ScooterDocumentJobsService } from "./scooter-document-jobs.service";
import { ScooterDocumentDispatcherService } from "./scooter-document-dispatcher.service";
import { ScooterDocumentCleanupService } from "./scooter-document-cleanup.service";
import { ScootersService } from "../scooters/scooters.service";
import type { CivVocabularyService } from "../scooters/civ-vocabulary.service";

// Never silently fall back to the developer/application database.
const databaseUrl = process.env.TEST_DOCUMENT_JOBS_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("durable scooter document lifecycle (isolated PostgreSQL)", () => {
  let prisma: PrismaClient;
  let userId: string;
  let scooterId: string;
  let brandId: string;
  let documents: ScooterDocumentsService;
  let jobs: ScooterDocumentJobsService;
  let dispatcher: ScooterDocumentDispatcherService;
  let cleanup: ScooterDocumentCleanupService;
  let scooters: ScootersService;
  const sessionIds: string[] = [];
  const sourceTokens = new Map<string, StoredDocument>();
  const env = {
    NODE_ENV: "test",
    SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED: true,
    SCOOTER_DOCUMENT_EXTRACTION_DRIVER: "fake",
    SCOOTER_DOCUMENT_EXTRACTION_MODEL: "fixture",
    IMAGE_STORAGE_S3_BUCKET: "private-fixtures",
  } as Env;
  const storage = {
    verifyDocumentUploadToken: jest.fn((token: string) => {
      const value = sourceTokens.get(token);
      if (!value) throw new Error("Expired token");
      return value;
    }),
    createDocumentAnalysisKey: (id: string) =>
      `fixtures/extraction-temporary/${id}`,
    deleteDocumentForCleanup: jest.fn().mockResolvedValue(undefined),
  };
  const provider = {
    start: jest.fn().mockImplementation(({ jobId }: { jobId: string }) =>
      Promise.resolve({
        id: `resp_${jobId}`,
        status: "queued",
      }),
    ),
    retrieve: jest.fn().mockResolvedValue({
      id: "resp_fixture",
      status: "completed",
      output: {
        detectedDocumentType: "civ",
        vin: null,
        fields: [],
        rawFields: [],
      },
    }),
    cancel: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const validation = {
    validate: jest.fn(
      ({ source, outputKey }: { source: StoredDocument; outputKey: string }) =>
        Promise.resolve({ ...source, storageKey: outputKey }),
    ),
  };

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)
    )
      throw new Error(
        "Integration suite requires an explicit isolated local database.",
      );
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5000,
      }),
    });
    await prisma.$connect();
    const id = randomUUID();
    userId = (
      await prisma.user.create({
        data: { email: `document-jobs-${id}@example.invalid` },
      })
    ).id;
    brandId = (
      await prisma.scooterBrand.create({
        data: { name: `Jobs ${id}`, code: `J${id}` },
      })
    ).id;
    scooterId = (
      await prisma.scooter.create({
        data: {
          vin: id.replaceAll("-", "").slice(0, 17),
          brandId,
          fleetNumber: Math.floor(Math.random() * 1_000_000) + 1_000_000,
          powertrainType: "electric",
        },
      })
    ).id;
    const db = prisma as unknown as PrismaService;
    documents = new ScooterDocumentsService(
      db,
      storage as unknown as ImageStorageService,
    );
    jobs = new ScooterDocumentJobsService(db, documents, env);
    const extractor = new ScooterDocumentExtractionService({
      analyze: () => Promise.resolve({}),
    });
    dispatcher = new ScooterDocumentDispatcherService(
      db,
      storage as unknown as ImageStorageService,
      validation as unknown as DocumentValidationService,
      provider as unknown as OpenAiScooterDocumentJobProvider,
      extractor,
      env,
    );
    cleanup = new ScooterDocumentCleanupService(
      db,
      storage as unknown as ImageStorageService,
      provider as unknown as OpenAiScooterDocumentJobProvider,
      jobs,
      env,
    );
    scooters = new ScootersService(
      db,
      documents,
      {
        remember: () => Promise.resolve(undefined),
      } as unknown as CivVocabularyService,
      {
        prepareDrafts: () => Promise.resolve([]),
        applyDrafts: () => Promise.resolve(undefined),
      } as unknown as import("../scooters/scooter-photos.service").ScooterPhotosService,
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.scooterDocumentResource.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await prisma.scooterDocumentJob.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await prisma.draftUpload.deleteMany({
      where: { editorSessionId: { in: sessionIds } },
    });
    await prisma.scooterDocumentEditorSession.deleteMany({
      where: { id: { in: sessionIds } },
    });
    await prisma.scooterDocument.deleteMany({ where: { scooterId } });
    await prisma.mediaAsset.deleteMany({ where: { uploadedByUserId: userId } });
    await prisma.scooter.delete({ where: { id: scooterId } });
    await prisma.scooterBrand.delete({ where: { id: brandId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Terminal states isolate quota tests while preserving rows for race assertions.
    if (userId)
      await prisma.scooterDocumentJob.updateMany({
        where: { userId },
        data: { status: "failed", submissionUncertainAt: null },
      });
    storage.deleteDocumentForCleanup.mockResolvedValue(undefined);
    provider.start.mockImplementation(({ jobId }: { jobId: string }) =>
      Promise.resolve({
        id: `resp_${jobId}`,
        status: "queued",
      }),
    );
  });

  async function fixture() {
    const session = await jobs.createSession(userId);
    sessionIds.push(session.id);
    const source: StoredDocument = {
      provider: "s3",
      bucket: env.IMAGE_STORAGE_S3_BUCKET!,
      storageKey: `fixtures/scooter-documents/${randomUUID()}.pdf`,
      contentType: "application/pdf",
      byteSize: 100,
      checksumSha256: "a".repeat(64),
      imageWidth: null,
      imageHeight: null,
      pageCount: null,
    };
    const token = randomUUID();
    sourceTokens.set(token, source);
    const upload = await prisma.draftUpload.create({
      data: {
        userId,
        editorSessionId: session.id,
        provider: source.provider,
        bucket: source.bucket,
        storageKey: source.storageKey,
        contentType: source.contentType,
        byteSize: source.byteSize,
        checksumSha256: source.checksumSha256,
        purpose: "scooter-document:civ",
        expiresAt: new Date(Date.now() + 86_400_000),
        writeSafeAfter: new Date(Date.now() + 60_000),
      },
    });
    const resource = await prisma.scooterDocumentResource.create({
      data: {
        identity: `s3:${source.bucket}:${source.storageKey}`,
        sessionId: session.id,
        draftUploadId: upload.id,
        kind: "original",
        bucket: source.bucket,
        storageKey: source.storageKey,
        lastPossibleWriteAt: new Date(Date.now() + 60_000),
        cleanupAfter: new Date(Date.now() + 86_400_000),
      },
    });
    const input = {
      sessionId: session.id,
      sourceId: "source",
      attemptId: randomUUID(),
      source: {
        kind: "draft" as const,
        type: "civ" as const,
        uploadToken: token,
      },
    };
    return { session, source, token, upload, resource, input };
  }

  it("atomically caps live import drafts at 20 without counting legacy sessions", async () => {
    const legacy = await jobs.createSession(userId);
    sessionIds.push(legacy.id);
    const results = await Promise.allSettled(
      Array.from({ length: 21 }, () => jobs.createImportDraft(userId)),
    );
    const created = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    sessionIds.push(...created.map((draft) => draft.id));
    expect(created).toHaveLength(20);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const current = created[0];
    const changes = await Promise.allSettled([
      jobs.updateImportDraft(
        current.id,
        { revision: 0, state: { vin: "first" } },
        userId,
      ),
      jobs.updateImportDraft(
        current.id,
        { revision: 0, state: { vin: "second" } },
        userId,
      ),
    ]);
    expect(
      changes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await jobs.getImportDraft(current.id, userId)).revision).toBe(1);
    await Promise.all(
      created.map((draft) => jobs.discardImportDraft(draft.id, userId)),
    );
    expect((await jobs.listImportDrafts(userId)).items).toHaveLength(0);
    const replacement = await jobs.createImportDraft(userId);
    sessionIds.push(replacement.id);
    await jobs.discardImportDraft(replacement.id, userId);
  });

  it("atomically groups completed documents and refuses busy, stale or foreign-owner drafts", async () => {
    const target = await fixture();
    const source = await fixture();
    await prisma.scooterDocumentEditorSession.updateMany({
      where: { id: { in: [target.session.id, source.session.id] } },
      data: { isImportDraft: true },
    });
    const input = {
      sourceId: source.session.id,
      sourceRevision: 0,
      revision: 0,
      state: { notes: "Keep manual destination values" },
    };
    await expect(
      jobs.mergeImportDraft(target.session.id, input, "another-owner"),
    ).rejects.toThrow();
    await expect(
      jobs.mergeImportDraft(
        target.session.id,
        { ...input, revision: 1 },
        userId,
      ),
    ).rejects.toMatchObject({
      response: { code: "IMPORT_DRAFT_REVISION_CONFLICT" },
    });
    const job = await jobs.start(source.input, userId);
    await expect(
      jobs.mergeImportDraft(target.session.id, input, userId),
    ).rejects.toMatchObject({ response: { code: "IMPORT_DRAFT_BUSY" } });
    expect(
      (
        await prisma.draftUpload.findUniqueOrThrow({
          where: { id: source.upload.id },
        })
      ).editorSessionId,
    ).toBe(source.session.id);
    await prisma.scooterDocumentJob.update({
      where: { id: job.id },
      data: { status: "completed" },
    });
    const merged = await jobs.mergeImportDraft(
      target.session.id,
      input,
      userId,
    );
    expect(merged).toMatchObject({
      id: target.session.id,
      revision: 1,
      state: input.state,
    });
    expect(
      (
        await prisma.draftUpload.findUniqueOrThrow({
          where: { id: source.upload.id },
        })
      ).editorSessionId,
    ).toBe(target.session.id);
    expect(
      (
        await prisma.scooterDocumentResource.findUniqueOrThrow({
          where: { id: source.resource.id },
        })
      ).sessionId,
    ).toBe(target.session.id);
    expect(
      (
        await prisma.scooterDocumentJob.findUniqueOrThrow({
          where: { id: job.id },
        })
      ).sessionId,
    ).toBe(target.session.id);
    await expect(
      jobs.getImportDraft(source.session.id, userId),
    ).rejects.toThrow();
  });

  it("allows one admin to fill all 20 processing slots and keeps overflow queued", async () => {
    const fixtures = await Promise.all(
      Array.from({ length: 21 }, () => fixture()),
    );
    const started = await Promise.all(
      fixtures.map((f) => jobs.start(f.input, userId)),
    );
    for (const job of started) {
      expect(job.status).toBe("queued");
      // Waiting for another scooter must not consume a five-minute processing window.
      expect(new Date(job.expiresAt).getTime() - Date.now()).toBeGreaterThan(
        20 * 60_000,
      );
    }
    await Promise.all(
      started.map(async ({ id }) =>
        dispatcher.process(
          await prisma.scooterDocumentJob.findUniqueOrThrow({ where: { id } }),
        ),
      ),
    );
    const rows = await prisma.scooterDocumentJob.findMany({
      where: { id: { in: started.map((job) => job.id) } },
    });
    expect(rows.filter((job) => job.slotReservedAt)).toHaveLength(20);
    expect(validation.validate).toHaveBeenCalledTimes(20);
    expect(
      rows
        .filter((job) => !job.slotReservedAt)
        .every((job) => job.status === "queued"),
    ).toBe(true);
  });

  it("deduplicates concurrent starts globally and recovers a lost response after token expiry", async () => {
    const f = await fixture();
    const [first, second] = await Promise.all([
      jobs.start(f.input, userId),
      jobs.start(f.input, userId),
    ]);
    expect(first.id).toBe(second.id);
    expect(
      await prisma.scooterDocumentJob.count({
        where: { sessionId: f.session.id },
      }),
    ).toBe(1);
    sourceTokens.delete(f.token);
    expect((await jobs.start(f.input, userId)).id).toBe(first.id);
    await expect(jobs.status(first.id, "different-owner")).rejects.toThrow();
    expect(provider.start).not.toHaveBeenCalled();
  });

  it("tracks abandoned PUTs, respects late-write grace, and retries partial storage cleanup", async () => {
    const f = await fixture();
    await jobs.discardSession(f.session.id, userId);
    await cleanup.clean(f.resource);
    expect(storage.deleteDocumentForCleanup).not.toHaveBeenCalled();
    await prisma.scooterDocumentResource.update({
      where: { id: f.resource.id },
      data: { lastPossibleWriteAt: new Date(0) },
    });
    storage.deleteDocumentForCleanup.mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );
    await cleanup.clean(f.resource);
    let ledger = await prisma.scooterDocumentResource.findUniqueOrThrow({
      where: { id: f.resource.id },
    });
    expect(ledger.status).toBe("cleanup_pending");
    expect(ledger.errorCode).toBe("EXTERNAL_CLEANUP_FAILED");
    expect(
      await prisma.draftUpload.findUnique({ where: { id: f.upload.id } }),
    ).not.toBeNull();
    await prisma.scooterDocumentResource.update({
      where: { id: ledger.id },
      data: { cleanupAfter: new Date(0) },
    });
    await Promise.all([cleanup.clean(ledger), cleanup.clean(ledger)]);
    ledger = await prisma.scooterDocumentResource.findUniqueOrThrow({
      where: { id: ledger.id },
    });
    expect(ledger.status).toBe("deleted");
    expect(ledger.deletedAt).not.toBeNull();
    expect(storage.deleteDocumentForCleanup).toHaveBeenCalledTimes(2);
  });

  it("atomically chooses between final save and discard without deleting a saved original", async () => {
    const f = await fixture();
    const save = prisma.$transaction((tx) =>
      documents.apply(
        tx,
        scooterId,
        [
          {
            type: "civ",
            fileName: "fixture.pdf",
            uploadToken: f.token,
            stored: f.source,
          },
        ],
        [],
        userId,
        [],
        f.session.id,
        "fixture-save",
      ),
    );
    const outcomes = await Promise.allSettled([
      save,
      jobs.discardSession(f.session.id, userId),
    ]);
    const session = await prisma.scooterDocumentEditorSession.findUniqueOrThrow(
      { where: { id: f.session.id } },
    );
    const upload = await prisma.draftUpload.findUniqueOrThrow({
      where: { id: f.upload.id },
    });
    if (session.status === "saved") {
      expect(outcomes[0].status).toBe("fulfilled");
      expect(upload.claimedAt).not.toBeNull();
      await prisma.scooterDocumentResource.update({
        where: { id: f.resource.id },
        data: { cleanupAfter: new Date(0), lastPossibleWriteAt: new Date(0) },
      });
      await cleanup.clean(f.resource);
      expect(storage.deleteDocumentForCleanup).not.toHaveBeenCalled();
    } else {
      expect(session.status).toBe("discarded");
      expect(outcomes[0].status).toBe("rejected");
      expect(upload.claimedAt).toBeNull();
      expect(
        await prisma.mediaAsset.findUnique({
          where: { storageKey: f.source.storageKey },
        }),
      ).toBeNull();
    }
  });

  it("preserves claims on rollback and promotes running jobs when the document is saved", async () => {
    const f = await fixture();
    const started = await jobs.start(f.input, userId);
    await expect(
      prisma.$transaction(async (tx) => {
        await documents.apply(
          tx,
          scooterId,
          [
            {
              type: "civ",
              fileName: "fixture.pdf",
              uploadToken: f.token,
              stored: f.source,
            },
          ],
          [],
          userId,
          [],
          f.session.id,
        );
        throw new Error("Final save failed");
      }),
    ).rejects.toThrow("Final save failed");
    expect(
      (
        await prisma.draftUpload.findUniqueOrThrow({
          where: { id: f.upload.id },
        })
      ).claimedAt,
    ).toBeNull();
    expect(
      (
        await prisma.scooterDocumentEditorSession.findUniqueOrThrow({
          where: { id: f.session.id },
        })
      ).status,
    ).toBe("open");
    await prisma.$transaction((tx) =>
      documents.apply(
        tx,
        scooterId,
        [
          {
            type: "civ",
            fileName: "fixture.pdf",
            uploadToken: f.token,
            stored: f.source,
          },
        ],
        [],
        userId,
        [],
        f.session.id,
      ),
    );
    const job = await prisma.scooterDocumentJob.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect(job.draftUploadId).toBeNull();
    expect(job.documentId).not.toBeNull();
    expect((await jobs.status(job.id, userId)).status).toBe("queued");
  });

  it("does not resurrect abandoned jobs when OpenAI submission returns late", async () => {
    const f = await fixture();
    const started = await jobs.start(f.input, userId);
    await jobs.discardSession(f.session.id, userId);
    const late = await dispatcher.recordResponse(
      started.id,
      `resp_late_${started.id}`,
    );
    expect(late?.status).toBe("cancelled");
    expect((await jobs.status(started.id, userId)).status).toBe("cancelled");
    const resources = await prisma.scooterDocumentResource.findMany({
      where: { jobId: started.id, kind: "provider" },
    });
    expect(resources).toHaveLength(1);
    expect(resources[0].status).toBe("cleanup_pending");
  });

  it("never resubmits a provider attempt whose acknowledgement was lost", async () => {
    const f = await fixture();
    const started = await jobs.start(f.input, userId);
    let job = await prisma.scooterDocumentJob.findUniqueOrThrow({
      where: { id: started.id },
    });
    await dispatcher.process(job);
    job = await prisma.scooterDocumentJob.findUniqueOrThrow({
      where: { id: started.id },
    });
    provider.start.mockRejectedValueOnce(
      new Error("Connection dropped after acceptance"),
    );
    await dispatcher.process(job);
    job = await prisma.scooterDocumentJob.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect(job.status).toBe("submission_unknown");
    await dispatcher.process(job);
    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(job.submissionUncertainAt).not.toBeNull();
  });

  it("returns the committed scalar save on response-loss retry and rejects changed retries", async () => {
    const session = await jobs.createSession(userId);
    sessionIds.push(session.id);
    const input = { sessionId: session.id, notes: "Idempotent scalar edit" };
    const first = await scooters.update(scooterId, input, userId);
    const second = await scooters.update(scooterId, input, userId);
    expect(second.id).toBe(first.id);
    await expect(
      scooters.update(
        scooterId,
        { ...input, notes: "Different command" },
        userId,
      ),
    ).rejects.toThrow("already saved a different request");
  });

  it.each(["cancel", "discard", "expire"])(
    "retains uncertain paid work when %s races an accepted request timeout",
    async (action) => {
      const f = await fixture();
      const started = await jobs.start(f.input, userId);
      await dispatcher.process(
        await prisma.scooterDocumentJob.findUniqueOrThrow({
          where: { id: started.id },
        }),
      );
      provider.start.mockImplementationOnce(
        async ({ jobId }: { jobId: string }) => {
          if (action === "cancel") await jobs.cancel(jobId, userId);
          else if (action === "discard")
            await jobs.discardSession(f.session.id, userId);
          else
            await prisma.scooterDocumentJob.update({
              where: { id: jobId },
              data: { status: "expired", cancellationAt: new Date() },
            });
          throw new Error("Accepted request lost its acknowledgement");
        },
      );
      await dispatcher.process(
        await prisma.scooterDocumentJob.findUniqueOrThrow({
          where: { id: started.id },
        }),
      );
      const job = await prisma.scooterDocumentJob.findUniqueOrThrow({
        where: { id: started.id },
      });
      expect(job.status).toBe(action === "expire" ? "expired" : "cancelled");
      expect(job.providerResponseId).toBeNull();
      expect(job.submissionUncertainAt).not.toBeNull();
      expect(provider.start).toHaveBeenCalledTimes(1);
    },
  );

  it("does not recreate uncertainty when a webhook already correlated a timed-out submission", async () => {
    const f = await fixture();
    const started = await jobs.start(f.input, userId);
    await dispatcher.process(
      await prisma.scooterDocumentJob.findUniqueOrThrow({
        where: { id: started.id },
      }),
    );
    provider.start.mockImplementationOnce(
      async ({ jobId }: { jobId: string }) => {
        await dispatcher.recordResponse(jobId, `resp_reconciled_${jobId}`);
        throw new Error("Acknowledgement lost after webhook arrived");
      },
    );
    await dispatcher.process(
      await prisma.scooterDocumentJob.findUniqueOrThrow({
        where: { id: started.id },
      }),
    );
    const job = await prisma.scooterDocumentJob.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect(job.status).toBe("running");
    expect(job.providerResponseId).toBe(`resp_reconciled_${started.id}`);
    expect(job.submissionUncertainAt).toBeNull();
  });
});
