import { ConflictException } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { ScooterDocumentsService } from "../scooters/scooter-documents.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import { ScooterDocumentJobsService } from "./scooter-document-jobs.service";

const draft = {
  id: "draft",
  userId: "owner",
  status: "open",
  isImportDraft: true,
  revision: 3,
  editorState: {
    notes: "Keep the manually corrected VIN",
    review: { accepted: true },
  },
  expiresAt: new Date(Date.now() + 86_400_000),
  updatedAt: new Date(),
};

function setup() {
  const sessions = {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue(draft),
    findFirst: jest.fn().mockResolvedValue(draft),
    findMany: jest.fn().mockResolvedValue([draft]),
    update: jest
      .fn()
      .mockImplementation(({ data }: { data: { editorState: unknown } }) =>
        Promise.resolve({
          ...draft,
          editorState: data.editorState,
          revision: draft.revision + 1,
        }),
      ),
  };
  const tx = { $queryRaw: jest.fn(), scooterDocumentEditorSession: sessions };
  const prisma = {
    ...tx,
    $transaction: <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
  };
  return {
    sessions,
    service: new ScooterDocumentJobsService(
      prisma as unknown as PrismaService,
      {} as ScooterDocumentsService,
      {} as Env,
    ),
  };
}

it("counts only live import drafts when enforcing the 20-scooter limit", async () => {
  const { sessions, service } = setup();
  sessions.count.mockResolvedValue(20);
  await expect(service.createImportDraft("owner")).rejects.toBeInstanceOf(
    ConflictException,
  );
  expect(sessions.count).toHaveBeenCalledWith({
    where: {
      userId: "owner",
      isImportDraft: true,
      status: "open",
      expiresAt: { gt: expect.any(Date) as Date },
    },
  });
  expect(sessions.create).not.toHaveBeenCalled();
});

it("persists reviewed values with an incremented optimistic revision", async () => {
  const { service, sessions } = setup();
  const state = {
    notes: "Corrected",
    sources: [{ id: "front", reviewed: true }],
  };
  const result = await service.updateImportDraft(
    "draft",
    { revision: 3, state },
    "owner",
  );
  expect(result).toMatchObject({ id: "draft", revision: 4, state });
  expect(sessions.findFirst).toHaveBeenCalledWith({
    where: {
      id: "draft",
      userId: "owner",
      status: "open",
      expiresAt: { gt: expect.any(Date) as Date },
    },
  });
});

it("rejects a stale write without replacing the saved correction", async () => {
  const { service, sessions } = setup();
  await expect(
    service.updateImportDraft("draft", { revision: 2, state: {} }, "owner"),
  ).rejects.toMatchObject({
    response: { code: "IMPORT_DRAFT_REVISION_CONFLICT" },
  });
  expect(sessions.update).not.toHaveBeenCalled();
});

it("does not expose another owner's, closed, or ordinary editor session as an import draft", async () => {
  const { service, sessions } = setup();
  sessions.findFirst.mockResolvedValue(null);
  await expect(service.getImportDraft("draft", "other")).rejects.toThrow(
    "not found",
  );
  expect(sessions.findFirst).toHaveBeenCalledWith({
    where: {
      id: "draft",
      userId: "other",
      isImportDraft: true,
      status: "open",
      expiresAt: { gt: expect.any(Date) as Date },
    },
  });
});

it("bounds snapshot size in UTF-8 bytes and accepts document metadata", () => {
  expect(
    v1.scooters.updateScooterImportDraftSchema.safeParse({
      revision: 0,
      state: {
        documents: [
          { name: "CIV.pdf", sourceId: "front", uploadToken: "private" },
        ],
      },
    }).success,
  ).toBe(true);
  expect(
    v1.scooters.updateScooterImportDraftSchema.safeParse({
      revision: 0,
      state: {
        documentBytes: "ă".repeat(
          v1.scooters.SCOOTER_IMPORT_DRAFT_MAX_STATE_BYTES / 2,
        ),
      },
    }).success,
  ).toBe(false);
  expect(
    v1.scooters.updateScooterImportDraftSchema.safeParse({
      revision: 0,
      state: { notJson: undefined },
    }).success,
  ).toBe(false);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(
    v1.scooters.updateScooterImportDraftSchema.safeParse({
      revision: 0,
      state: cyclic,
    }).success,
  ).toBe(false);
});

it("refuses to preview an upload belonging to another editor session", async () => {
  const uploadLookup = jest.fn().mockResolvedValue(null);
  const readDocument = jest.fn();
  const tx = {
    $queryRaw: jest.fn(),
    scooterDocumentEditorSession: {
      findFirst: jest.fn().mockResolvedValue(draft),
    },
    draftUpload: { findFirst: uploadLookup },
  };
  const service = new ScooterDocumentJobsService(
    {
      $transaction: <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaService,
    {
      resolveAnalysisSource: jest.fn().mockResolvedValue({
        draftUploadId: "upload",
        stored: { storageKey: "original.pdf" },
      }),
    } as unknown as ScooterDocumentsService,
    {} as Env,
    { readDocument } as unknown as ImageStorageService,
  );
  await expect(
    service.importDraftDocumentContent(
      "draft",
      {
        sourceId: "front",
        source: { kind: "draft", type: "civ", uploadToken: "private" },
      },
      "owner",
    ),
  ).rejects.toThrow("not found");
  expect(uploadLookup).toHaveBeenCalledWith({
    where: {
      id: "upload",
      editorSessionId: "draft",
      userId: "owner",
      claimedAt: null,
      cleanupStartedAt: null,
      expiresAt: { gt: expect.any(Date) as Date },
    },
    select: { id: true },
  });
  expect(readDocument).not.toHaveBeenCalled();
});

it("refuses photo previews after an upload was claimed and verifies the original owner scope", async () => {
  const uploadLookup = jest.fn().mockResolvedValue(null);
  const completePresignedUpload = jest.fn().mockResolvedValue({
    provider: "s3",
    bucket: "private",
    storageKey: "photo.jpg",
    contentType: "image/jpeg",
    byteSize: 100,
    checksumSha256: "a".repeat(64),
  });
  const readImage = jest.fn();
  const tx = {
    $queryRaw: jest.fn(),
    scooterDocumentEditorSession: {
      findFirst: jest.fn().mockResolvedValue(draft),
    },
    draftUpload: { findFirst: uploadLookup },
  };
  const prisma = {
    ...tx,
    $transaction: <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx),
  };
  const service = new ScooterDocumentJobsService(
    prisma as unknown as PrismaService,
    {} as ScooterDocumentsService,
    {} as Env,
    { completePresignedUpload, readImage } as unknown as ImageStorageService,
  );
  await expect(
    service.importDraftPhotoContent("draft", "token", "owner"),
  ).rejects.toThrow("not found");
  expect(completePresignedUpload).toHaveBeenCalledWith(
    "token",
    "scooter-photo-draft:owner",
  );
  expect(uploadLookup).toHaveBeenCalledWith({
    where: {
      userId: "owner",
      purpose: "scooter-photo-draft",
      storageKey: "photo.jpg",
      provider: "s3",
      bucket: "private",
      contentType: "image/jpeg",
      byteSize: 100,
      checksumSha256: "a".repeat(64),
      claimedAt: null,
      cleanupStartedAt: null,
      expiresAt: { gt: expect.any(Date) as Date },
    },
    select: { id: true },
  });
  expect(readImage).not.toHaveBeenCalled();
});
