import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";

import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ExpenseDocumentsService } from "./expense-documents.service";

const now = new Date("2026-02-02T12:00:00.000Z");

function documentRow(
  assets: Array<Record<string, unknown>> = [],
): Record<string, unknown> {
  return {
    id: "document-1",
    expenseId: "expense-1",
    type: "INVOICE",
    documentSeries: null,
    documentNumber: "INV-1",
    supplierName: "Supplier",
    supplierTaxIdentifier: "RO999999",
    buyerTaxIdentifier: "RO123456",
    issuedOn: new Date("2026-01-10T00:00:00.000Z"),
    buyerCuiStatus: "MATCHED",
    reviewStatus: "CONFIRMED",
    reviewedByUserId: "user-1",
    reviewedAt: now,
    notes: null,
    createdAt: now,
    updatedAt: now,
    expense: { status: "DRAFT" },
    assets,
  };
}

describe("ExpenseDocumentsService", () => {
  const expenseFindUnique = jest.fn();
  const documentFindFirst = jest.fn();
  const documentFindMany = jest.fn();
  const documentCreate = jest.fn<Promise<Record<string, unknown>>, [unknown]>();
  const documentUpdate = jest.fn();
  const documentDelete = jest.fn();
  const linkFindUnique = jest.fn();
  const linkFindFirst = jest.fn();
  const linkCreate = jest.fn();
  const mediaCreate = jest.fn<Promise<{ id: string }>, [unknown]>();
  const mediaFindUnique = jest.fn();
  const mediaUpdateMany = jest.fn();
  const transaction = jest.fn();
  const createPresignedDocumentUpload = jest.fn();
  const completePresignedDocumentUpload = jest.fn();
  const readDocument = jest.fn();
  const deleteDocument = jest.fn();

  const prisma = {
    expense: { findUnique: expenseFindUnique },
    expenseDocument: {
      findFirst: documentFindFirst,
      findMany: documentFindMany,
      create: documentCreate,
      update: documentUpdate,
      delete: documentDelete,
    },
    expenseDocumentAsset: {
      findUnique: linkFindUnique,
      findFirst: linkFindFirst,
      create: linkCreate,
    },
    mediaAsset: {
      create: mediaCreate,
      findUnique: mediaFindUnique,
      updateMany: mediaUpdateMany,
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  const imageStorage = {
    createPresignedDocumentUpload,
    completePresignedDocumentUpload,
    readDocument,
    deleteDocument,
  } as unknown as ImageStorageService;
  const service = new ExpenseDocumentsService(prisma, imageStorage);

  beforeEach(() => {
    jest.clearAllMocks();
    expenseFindUnique.mockResolvedValue({
      id: "expense-1",
      status: "DRAFT",
      legalEntity: { company: { taxIdentifier: "123456" } },
    });
    documentFindFirst.mockResolvedValue(documentRow());
    documentCreate.mockResolvedValue(documentRow());
    documentUpdate.mockResolvedValue(documentRow());
    linkFindUnique.mockResolvedValue(null);
    mediaFindUnique.mockResolvedValue(null);
    transaction.mockImplementation(async (work: unknown) => {
      if (Array.isArray(work)) return Promise.all(work as Promise<unknown>[]);
      const transactionClient = {
        expenseDocument: { findFirst: documentFindFirst },
        expenseDocumentAsset: {
          findUnique: linkFindUnique,
          create: linkCreate,
        },
        mediaAsset: { create: mediaCreate },
      };
      const callback = work as (
        tx: typeof transactionClient,
      ) => Promise<unknown>;
      return callback(transactionClient);
    });
  });

  it("validates MATCHED fiscal evidence against the legal entity tax ID", async () => {
    await service.create(
      "expense-1",
      {
        type: "INVOICE",
        documentNumber: "INV-1",
        buyerTaxIdentifier: "ro 12-3456",
        buyerCuiStatus: "MATCHED",
        reviewStatus: "CONFIRMED",
      },
      "reviewer-1",
    );

    const createCall = documentCreate.mock.calls[0]?.[0] as {
      data: {
        buyerTaxIdentifier: string;
        reviewedBy: { connect: { id: string } };
        reviewedAt: Date;
      };
    };
    expect(createCall.data).toMatchObject({
      buyerTaxIdentifier: "ro 12-3456",
      reviewedBy: { connect: { id: "reviewer-1" } },
    });
    expect(createCall.data.reviewedAt).toBeInstanceOf(Date);

    await expect(
      service.create(
        "expense-1",
        {
          type: "INVOICE",
          buyerTaxIdentifier: "RO000000",
          buyerCuiStatus: "MATCHED",
          reviewStatus: "PENDING",
        },
        "reviewer-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("binds PDF page count and upload identity into the signed token", async () => {
    createPresignedDocumentUpload.mockResolvedValue({
      provider: "s3",
      bucket: "private-bucket",
      storageKey: "private/doc.pdf",
      uploadUrl: "https://signed.example/doc.pdf",
      uploadToken: "signed-token",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresAt: now,
      maxBytes: 10_000,
    });

    await expect(
      service.createUploadUrl(
        "expense-1",
        "document-1",
        "ORIGINAL",
        {
          contentType: "application/pdf",
          byteSize: 512,
          checksumSha256: "a".repeat(64),
          pageCount: 3,
        },
        "user-1",
      ),
    ).resolves.toEqual({
      uploadUrl: "https://signed.example/doc.pdf",
      uploadToken: "signed-token",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresAt: now.toISOString(),
      maxBytes: 10_000,
    });

    expect(createPresignedDocumentUpload).toHaveBeenCalledWith({
      contentType: "application/pdf",
      byteSize: 512,
      checksumSha256: "a".repeat(64),
      pageCount: 3,
      scope: "expense-document:expense-1:document-1:original:user-1",
    });
  });

  it("atomically creates immutable asset metadata from signed upload fields", async () => {
    const stored = {
      provider: "s3" as const,
      bucket: "private-bucket",
      storageKey: "private/doc.pdf",
      contentType: "application/pdf" as const,
      byteSize: 512,
      checksumSha256: "a".repeat(64),
      imageWidth: null,
      imageHeight: null,
      pageCount: 3,
    };
    completePresignedDocumentUpload.mockResolvedValue(stored);
    mediaCreate.mockResolvedValue({ id: "asset-1" });
    linkCreate.mockResolvedValue({ id: "link-1" });

    await service.completeUpload(
      "expense-1",
      "document-1",
      "ORIGINAL",
      { uploadToken: "signed-token" },
      "user-1",
    );

    expect(completePresignedDocumentUpload).toHaveBeenCalledWith(
      "signed-token",
      "expense-document:expense-1:document-1:original:user-1",
    );
    const mediaCreateCall = mediaCreate.mock.calls[0]?.[0] as {
      data: {
        storageKey: string;
        checksumSha256: string;
        uploadedByUser: { connect: { id: string } };
      };
    };
    expect(mediaCreateCall.data).toMatchObject({
      storageKey: "private/doc.pdf",
      checksumSha256: "a".repeat(64),
      uploadedByUser: { connect: { id: "user-1" } },
    });
    expect(linkCreate).toHaveBeenCalledWith({
      data: {
        document: { connect: { id: "document-1" } },
        asset: { connect: { id: "asset-1" } },
        role: "ORIGINAL",
        imageWidth: null,
        imageHeight: null,
        pageCount: 3,
      },
    });
  });

  it("does not issue or complete a replacement for an existing role", async () => {
    documentFindFirst.mockResolvedValue(
      documentRow([{ id: "link-1", role: "ORIGINAL" }]),
    );

    await expect(
      service.createUploadUrl(
        "expense-1",
        "document-1",
        "ORIGINAL",
        {
          contentType: "image/png",
          byteSize: 10,
          checksumSha256: "a".repeat(64),
          imageWidth: 10,
          imageHeight: 10,
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createPresignedDocumentUpload).not.toHaveBeenCalled();

    completePresignedDocumentUpload.mockResolvedValue({
      provider: "s3",
      bucket: "private-bucket",
      storageKey: "private/replacement.png",
      contentType: "image/png",
      byteSize: 10,
      checksumSha256: "a".repeat(64),
      imageWidth: 10,
      imageHeight: 10,
      pageCount: null,
    });
    linkFindUnique.mockResolvedValue({ id: "existing-link" });

    await expect(
      service.completeUpload(
        "expense-1",
        "document-1",
        "ORIGINAL",
        { uploadToken: "replacement-token" },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mediaCreate).not.toHaveBeenCalled();
    expect(deleteDocument).toHaveBeenCalledWith("private/replacement.png");
  });

  it("rechecks reversal state inside the asset attachment transaction", async () => {
    const stored = {
      provider: "s3" as const,
      bucket: "private-bucket",
      storageKey: "private/raced.png",
      contentType: "image/png" as const,
      byteSize: 10,
      checksumSha256: "c".repeat(64),
      imageWidth: 10,
      imageHeight: 10,
      pageCount: null,
    };
    completePresignedDocumentUpload.mockResolvedValue(stored);
    documentFindFirst
      .mockResolvedValueOnce(documentRow())
      .mockResolvedValueOnce({
        id: "document-1",
        expense: { status: "REVERSED" },
      });

    await expect(
      service.completeUpload(
        "expense-1",
        "document-1",
        "ORIGINAL",
        { uploadToken: "raced-token" },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mediaCreate).not.toHaveBeenCalled();
    expect(deleteDocument).toHaveBeenCalledWith("private/raced.png");
  });

  it("keeps posted evidence and streams only an expense-scoped asset", async () => {
    expenseFindUnique.mockResolvedValue({
      id: "expense-1",
      status: "POSTED",
      legalEntity: { company: { taxIdentifier: "RO123456" } },
    });
    await expect(
      service.delete("expense-1", "document-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(documentDelete).not.toHaveBeenCalled();

    await expect(
      service.create(
        "expense-1",
        {
          type: "INVOICE",
          buyerTaxIdentifier: "RO123456",
          buyerCuiStatus: "MATCHED",
          reviewStatus: "CONFIRMED",
        },
        "reviewer-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update(
        "expense-1",
        "document-1",
        { reviewStatus: "REJECTED" },
        "reviewer-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(documentCreate).not.toHaveBeenCalled();
    expect(documentUpdate).not.toHaveBeenCalled();

    createPresignedDocumentUpload.mockResolvedValue({
      provider: "s3",
      bucket: "private-bucket",
      storageKey: "private/posted.png",
      uploadUrl: "https://signed.example/posted.png",
      uploadToken: "posted-token",
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      expiresAt: now,
      maxBytes: 10_000,
    });
    await expect(
      service.createUploadUrl(
        "expense-1",
        "document-1",
        "ORIGINAL",
        {
          contentType: "image/png",
          byteSize: 12,
          checksumSha256: "b".repeat(64),
          imageWidth: 10,
          imageHeight: 10,
        },
        "user-1",
      ),
    ).resolves.toMatchObject({ uploadToken: "posted-token" });

    linkFindFirst.mockResolvedValue({
      asset: { storageKey: "private/doc.pdf", contentType: "application/pdf" },
    });
    readDocument.mockResolvedValue({
      body: {} as NodeJS.ReadableStream,
      contentType: "application/pdf",
      contentLength: 512,
    });

    await expect(
      service.getContent("expense-1", "document-1", "ORIGINAL"),
    ).resolves.toEqual(
      expect.objectContaining({
        contentType: "application/pdf",
        contentLength: 512,
      }),
    );
    expect(linkFindFirst).toHaveBeenCalledWith({
      where: {
        documentId: "document-1",
        role: "ORIGINAL",
        document: { expenseId: "expense-1" },
        asset: { deletedAt: null },
      },
      include: { asset: true },
    });

    readDocument.mockResolvedValue({
      body: {} as NodeJS.ReadableStream,
      contentType: "text/html",
      contentLength: 512,
    });
    await expect(
      service.getContent("expense-1", "document-1", "ORIGINAL"),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
