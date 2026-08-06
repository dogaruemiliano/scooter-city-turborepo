import {
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import type { ImageStorageService } from "../../image-storage/image-storage.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { ScooterSaleDocumentsService } from "./scooter-sale-documents.service";

const now = new Date("2026-02-02T12:00:00.000Z");

function documentRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "document-1",
    scooterSaleId: "sale-1",
    assetId: null,
    asset: null,
    imageWidth: null,
    imageHeight: null,
    pageCount: null,
    documentNumber: null,
    issuedOn: null,
    notes: null,
    createdByUserId: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ScooterSaleDocumentsService", () => {
  const saleFindUnique = jest.fn();
  const documentFindUnique = jest.fn();
  const documentCreate = jest.fn<Promise<Record<string, unknown>>, [unknown]>();
  const documentUpsert = jest.fn();
  const documentUpdate = jest.fn();
  const mediaCreate = jest.fn<Promise<{ id: string }>, [unknown]>();
  const mediaUpdate = jest.fn();
  const transaction = jest.fn();
  const createPresignedDocumentUpload = jest.fn();
  const completePresignedDocumentUpload = jest.fn();
  const readDocument = jest.fn();
  const deleteDocument = jest.fn();

  const prisma = {
    scooterSale: { findUnique: saleFindUnique },
    scooterSaleDocument: {
      findUnique: documentFindUnique,
      create: documentCreate,
      upsert: documentUpsert,
      update: documentUpdate,
    },
    mediaAsset: { create: mediaCreate, update: mediaUpdate },
    $transaction: transaction,
  } as unknown as PrismaService;
  const imageStorage = {
    createPresignedDocumentUpload,
    completePresignedDocumentUpload,
    readDocument,
    deleteDocument,
  } as unknown as ImageStorageService;
  const service = new ScooterSaleDocumentsService(prisma, imageStorage);

  beforeEach(() => {
    jest.clearAllMocks();
    saleFindUnique.mockResolvedValue({ id: "sale-1" });
    documentFindUnique.mockResolvedValue(documentRow());
    documentCreate.mockResolvedValue(documentRow());
    documentUpsert.mockResolvedValue(documentRow());
    documentUpdate.mockResolvedValue(documentRow());
    transaction.mockImplementation(async (work: unknown) => {
      const transactionClient = {
        mediaAsset: { create: mediaCreate, update: mediaUpdate },
        scooterSaleDocument: { update: documentUpdate },
      };
      const callback = work as (
        tx: typeof transactionClient,
      ) => Promise<unknown>;
      return callback(transactionClient);
    });
  });

  it("throws 404 when no bill has been attached yet", async () => {
    documentFindUnique.mockResolvedValue(null);
    await expect(service.get("sale-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("upserts document metadata against the sale's unique document row", async () => {
    await service.upsert(
      "sale-1",
      { documentNumber: "BILL-1", issuedOn: "2026-02-01", notes: null },
      "user-1",
    );

    expect(documentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scooterSaleId: "sale-1" },
        create: expect.objectContaining({ documentNumber: "BILL-1" }),
        update: expect.objectContaining({ documentNumber: "BILL-1" }),
      }),
    );
  });

  it("lazily creates the document row before issuing an upload URL", async () => {
    documentFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue(documentRow());
    createPresignedDocumentUpload.mockResolvedValue({
      provider: "s3",
      bucket: "private-bucket",
      storageKey: "private/bill.pdf",
      uploadUrl: "https://signed.example/bill.pdf",
      uploadToken: "signed-token",
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      expiresAt: now,
      maxBytes: 10_000,
    });

    await expect(
      service.createUploadUrl(
        "sale-1",
        {
          contentType: "application/pdf",
          byteSize: 512,
          checksumSha256: "a".repeat(64),
          pageCount: 1,
        },
        "user-1",
      ),
    ).resolves.toMatchObject({ uploadToken: "signed-token" });

    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scooterSale: { connect: { id: "sale-1" } },
          createdBy: { connect: { id: "user-1" } },
        }),
      }),
    );
    expect(createPresignedDocumentUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "scooter-sale-document:sale-1:user-1",
      }),
    );
  });

  it("attaches the uploaded asset and best-effort deletes a prior file when replaced", async () => {
    documentFindUnique.mockResolvedValue(
      documentRow({
        assetId: "asset-old",
        asset: { storageKey: "private/old.pdf" },
      }),
    );
    completePresignedDocumentUpload.mockResolvedValue({
      provider: "s3",
      bucket: "private-bucket",
      storageKey: "private/new.pdf",
      contentType: "application/pdf",
      byteSize: 512,
      checksumSha256: "b".repeat(64),
      imageWidth: null,
      imageHeight: null,
      pageCount: 2,
    });
    mediaCreate.mockResolvedValue({ id: "asset-new" });

    await service.completeUpload(
      "sale-1",
      { uploadToken: "signed-token" },
      "user-1",
    );

    expect(mediaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storageKey: "private/new.pdf" }),
      }),
    );
    expect(documentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scooterSaleId: "sale-1" },
        data: expect.objectContaining({ assetId: "asset-new", pageCount: 2 }),
      }),
    );
    expect(mediaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "asset-old" } }),
    );
    expect(deleteDocument).toHaveBeenCalledWith("private/old.pdf");
  });

  it("rejects streaming content when the stored content type does not match metadata", async () => {
    documentFindUnique.mockResolvedValue(
      documentRow({
        asset: {
          storageKey: "private/bill.pdf",
          contentType: "application/pdf",
          deletedAt: null,
        },
      }),
    );
    readDocument.mockResolvedValue({
      body: {} as NodeJS.ReadableStream,
      contentType: "text/html",
      contentLength: 512,
    });

    await expect(service.getContent("sale-1")).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
