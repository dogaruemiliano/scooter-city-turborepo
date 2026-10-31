import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ScooterDocumentsService } from "./scooter-documents.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";
import { Prisma } from "../generated/prisma/client";

const stored: StoredDocument = {
  provider: "s3",
  bucket: "private",
  storageKey: "scooter-documents/file.pdf",
  contentType: "application/pdf",
  byteSize: 100,
  checksumSha256: "a".repeat(64),
  imageWidth: null,
  imageHeight: null,
  pageCount: null,
};
const draft = {
  type: "civ" as const,
  fileName: "CIV.pdf",
  uploadToken: "token",
};

describe("ScooterDocumentsService", () => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    documentPackage: { findFirst: jest.fn().mockResolvedValue(null) },
    draftUpload: {
      create: jest.fn(),
      updateMany: jest.fn<
        Promise<{ count: number }>,
        [Prisma.DraftUploadUpdateManyArgs]
      >(),
      findFirst: jest.fn(),
    },
    scooterDocument: {
      count: jest.fn(),
      create: jest.fn<unknown, [Prisma.ScooterDocumentCreateArgs]>(),
      updateMany: jest.fn(),
      update: jest.fn<unknown, [Prisma.ScooterDocumentUpdateArgs]>(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    scooter: { findFirst: jest.fn() },
    scooterInsurancePolicy: { findFirst: jest.fn() },
    scooterItpInspection: { findFirst: jest.fn() },
  };
  const storage = {
    createPresignedDocumentUpload: jest.fn(),
    completePresignedDocumentUpload: jest.fn(),
    readDocument: jest.fn(),
    verifyDocumentUploadToken: jest.fn(),
  };
  const service = new ScooterDocumentsService(
    prisma as unknown as PrismaService,
    storage as unknown as ImageStorageService,
  );
  const tx = prisma as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.documentPackage.findFirst.mockResolvedValue(null);
    storage.completePresignedDocumentUpload.mockResolvedValue(stored);
    storage.verifyDocumentUploadToken.mockReturnValue(stored);
    prisma.draftUpload.updateMany.mockResolvedValue({ count: 1 });
    prisma.scooterDocument.count.mockResolvedValue(0);
    prisma.scooterInsurancePolicy.findFirst.mockResolvedValue({ id: "policy" });
  });
  it("attaches a client copy to an existing original without creating a second original", async () => {
    const prepared = await service.prepare(
      [{ ...draft, originalDocumentId: "saved-civ", fileName: "client.pdf" }],
      "user",
    );
    prisma.scooterDocument.findFirst.mockResolvedValue({
      id: "saved-civ",
      type: "civ",
      clientCopyAsset: null,
    });
    await service.apply(tx, "scooter", prepared, [], "user");
    expect(prisma.scooterDocument.create).not.toHaveBeenCalled();
    expect(prisma.scooterDocument.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "saved-civ" },
      data: { clientCopyFileName: "client.pdf" },
    });
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledTimes(1);
  });
  it("rejects client copies targeting another scooter or an original already carrying a client copy", async () => {
    const prepared = await service.prepare(
      [{ ...draft, originalDocumentId: "saved-civ" }],
      "user",
    );
    for (const original of [
      null,
      { id: "saved-civ", type: "civ", clientCopyAsset: { deletedAt: null } },
    ]) {
      prisma.scooterDocument.findFirst.mockResolvedValue(original);
      await expect(
        service.apply(tx, "scooter", prepared, [], "user"),
      ).rejects.toThrow(BadRequestException);
    }
    expect(prisma.scooterDocument.update).not.toHaveBeenCalled();
  });
  it("stores both versions as one document and claims both uploads", async () => {
    const copy = { ...stored, storageKey: "scooter-documents/client.pdf" };
    storage.completePresignedDocumentUpload
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce(copy);
    const prepared = await service.prepare(
      [
        {
          ...draft,
          clientCopy: {
            fileName: "Client.pdf",
            uploadToken: "copy",
            uploadType: "unclassified",
          },
        },
      ],
      "admin",
    );
    await service.apply(tx, "scooter", prepared, [], "admin");
    expect(prisma.scooterDocument.create).toHaveBeenCalledTimes(1);
    expect(prisma.scooterDocument.create.mock.calls[0][0]).toMatchObject({
      data: {
        asset: { create: { storageKey: stored.storageKey } },
        clientCopyAsset: { create: { storageKey: copy.storageKey } },
        clientCopyFileName: "Client.pdf",
      },
    });
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledTimes(2);
    expect(storage.completePresignedDocumentUpload).toHaveBeenLastCalledWith(
      "copy",
      "scooter-document:unclassified:admin",
    );
  });

  it("rejects reusing the same upload as both versions", async () => {
    await expect(
      service.prepare(
        [
          {
            ...draft,
            clientCopy: {
              fileName: "Copy.pdf",
              uploadToken: "token",
              uploadType: "civ",
            },
          },
        ],
        "admin",
      ),
    ).rejects.toThrow("Duplicate document version");
  });

  it("serves the requested client copy and rejects absent versions", async () => {
    prisma.scooterDocument.findFirst.mockResolvedValue({
      asset: stored,
      clientCopyAsset: { ...stored, storageKey: "client.pdf" },
    });
    storage.readDocument.mockResolvedValue({
      body: "fixture",
      contentLength: 100,
    });
    await service.content("scooter", "doc", "client_copy");
    expect(storage.readDocument).toHaveBeenLastCalledWith("client.pdf");
    await expect(service.content("scooter", "doc", "invalid")).rejects.toThrow(
      "Unknown document version",
    );
    prisma.scooterDocument.findFirst.mockResolvedValue({
      asset: stored,
      clientCopyAsset: null,
    });
    await expect(
      service.content("scooter", "doc", "client_copy"),
    ).rejects.toThrow("Document version not found");
  });

  it("keeps unclassified uploads bound to their owner through detection, reassignment and save", async () => {
    prisma.draftUpload.findFirst.mockResolvedValue({ id: "draft" });
    const selected = {
      ...draft,
      type: "registration_certificate" as const,
      uploadType: "unclassified" as const,
    };
    await expect(
      service.resolveAnalysisSource(
        { kind: "draft", type: "unclassified", uploadToken: "token" },
        "admin",
      ),
    ).resolves.toMatchObject({
      documentType: "unclassified",
      draftUploadId: "draft",
    });
    await expect(
      service.resolveAnalysisSource({ kind: "draft", ...selected }, "admin"),
    ).resolves.toMatchObject({ documentType: "registration_certificate" });
    expect(storage.verifyDocumentUploadToken).toHaveBeenLastCalledWith(
      "token",
      "scooter-document:unclassified:admin",
    );
    const prepared = await service.prepare([selected], "admin");
    expect(storage.completePresignedDocumentUpload).toHaveBeenCalledWith(
      "token",
      "scooter-document:unclassified:admin",
    );
    await service.apply(tx, "scooter", prepared, [], "admin");
    expect(prisma.draftUpload.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        userId: "admin",
        purpose: "scooter-document:unclassified",
        claimedAt: null,
      },
    });
    expect(prisma.scooterDocument.create.mock.calls[0][0]).toMatchObject({
      data: { type: "registration_certificate" },
    });
  });

  it("resolves signed drafts read-only with ownership, expiry, claim, cleanup and metadata predicates", async () => {
    prisma.draftUpload.findFirst.mockResolvedValue({ id: "draft" });
    await expect(
      service.resolveAnalysisSource(
        { kind: "draft", type: "civ", uploadToken: "token" },
        "admin",
      ),
    ).resolves.toEqual({ documentType: "civ", stored, draftUploadId: "draft" });
    expect(storage.verifyDocumentUploadToken).toHaveBeenCalledWith(
      "token",
      "scooter-document:civ:admin",
    );
    expect(prisma.draftUpload.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "admin",
        purpose: "scooter-document:civ",
        storageKey: stored.storageKey,
        provider: stored.provider,
        bucket: stored.bucket,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        expiresAt: { gt: expect.any(Date) as Date },
        claimedAt: null,
        cleanupStartedAt: null,
      },
      select: { id: true },
    });
    expect(storage.completePresignedDocumentUpload).not.toHaveBeenCalled();
    expect(storage.readDocument).not.toHaveBeenCalled();
    expect(prisma.draftUpload.updateMany).not.toHaveBeenCalled();
    expect(prisma.scooterDocument.create).not.toHaveBeenCalled();
  });
  it("rejects unavailable or forged draft sources before reading their bytes", async () => {
    prisma.draftUpload.findFirst.mockResolvedValue(null);
    await expect(
      service.resolveAnalysisSource(
        { kind: "draft", type: "civ", uploadToken: "token" },
        "other",
      ),
    ).rejects.toThrow(BadRequestException);
    storage.verifyDocumentUploadToken.mockImplementation(() => {
      throw new BadRequestException("Invalid token");
    });
    prisma.draftUpload.findFirst.mockClear();
    await expect(
      service.resolveAnalysisSource(
        { kind: "draft", type: "civ", uploadToken: "forged" },
        "admin",
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.draftUpload.findFirst).not.toHaveBeenCalled();
    expect(storage.readDocument).not.toHaveBeenCalled();
  });
  it("resolves only saved documents on their active scooter and takes type from the database", async () => {
    const source = {
      kind: "saved" as const,
      scooterId: "scooter",
      documentId: "doc",
    };
    prisma.scooterDocument.findFirst.mockResolvedValue({
      type: "insurance",
      asset: stored,
    });
    await expect(
      service.resolveAnalysisSource(source, "admin"),
    ).resolves.toEqual({ documentType: "insurance", stored });
    expect(prisma.scooterDocument.findFirst).toHaveBeenCalledWith({
      where: {
        id: "doc",
        scooterId: "scooter",
        deletedAt: null,
        scooter: { deletedAt: null },
        asset: { deletedAt: null },
      },
      include: { asset: true },
    });
    prisma.scooterDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.resolveAnalysisSource(source, "admin"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.scooterDocument.updateMany).not.toHaveBeenCalled();
  });
  it("binds verification to the uploading user and document type", async () => {
    await service.prepare([draft], "admin");
    expect(storage.completePresignedDocumentUpload).toHaveBeenCalledWith(
      "token",
      "scooter-document:civ:admin",
    );
    await expect(service.prepare([draft])).rejects.toThrow(BadRequestException);
    await expect(service.prepare([draft, draft], "admin")).rejects.toThrow(
      "Duplicate document",
    );
  });
  it("preserves client-copy documents referenced by retained contract packages", async () => {
    prisma.documentPackage.findFirst.mockResolvedValueOnce({ id: "package" });
    await expect(
      service.apply(tx, "scooter", [], ["registration"], "admin"),
    ).rejects.toThrow("retained contract package");
    expect(prisma.scooterDocument.updateMany).not.toHaveBeenCalled();
    expect(prisma.documentPackage.findFirst).toHaveBeenCalledWith({
      where: {
        rental: { scooterId: "scooter" },
        OR: [
          {
            snapshot: {
              path: ["vehicleDocuments"],
              array_contains: [{ documentId: "registration" }],
            },
          },
        ],
      },
      select: { id: true },
    });
  });
  it("retains the original paired evidence of confirmed inspections", async () => {
    prisma.scooterItpInspection.findFirst.mockResolvedValueOnce({
      id: "inspection",
    });
    await expect(
      service.apply(tx, "scooter", [], ["card"], "admin"),
    ).rejects.toThrow("supporting a confirmed inspection");
    expect(prisma.scooterDocument.updateMany).not.toHaveBeenCalled();
  });
  it("links a mixed original containing insurance to its policy without duplicating the file", async () => {
    const extractedData = {
      vin: null,
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "policy-doc",
          documentType: "insurance" as const,
          pages: [2],
          vin: null,
          fields: {},
          rawFields: {},
        },
      ],
    };
    await service.apply(
      tx,
      "scooter",
      [{ ...draft, stored, extractedData, insurancePolicyId: "policy" }],
      [],
      "admin",
    );
    expect(prisma.scooterDocument.create).toHaveBeenCalledTimes(1);
    expect(prisma.scooterDocument.create.mock.calls[0]?.[0].data).toMatchObject(
      {
        type: "civ",
        insurancePolicy: { connect: { id: "policy" } },
      },
    );
  });
  it("retains explicitly historical insurance without claiming it is the current policy", async () => {
    await service.apply(
      tx,
      "scooter",
      [
        {
          ...draft,
          stored,
          type: "insurance",
          extractedData: {
            vin: null,
            fields: {},
            rawFields: {},
            currentInsuranceDocumentId: null,
          },
        },
      ],
      [],
      "admin",
    );
    expect(prisma.scooterInsurancePolicy.findFirst).not.toHaveBeenCalled();
    expect(prisma.scooterDocument.create).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched logical VINs at the save boundary", async () => {
    const extractedData = {
      vin: "LXYTCKP05P0000001",
      fields: {},
      rawFields: {},
      documents: [
        {
          id: "other",
          documentType: "civ" as const,
          pages: [1],
          vin: "LXYTCKP05P0000002",
          fields: {},
          rawFields: {},
        },
      ],
    };
    await expect(
      service.apply(
        tx,
        "scooter",
        [{ ...draft, stored, extractedData }],
        [],
        "admin",
        [],
        undefined,
        undefined,
        "LXYTCKP05P0000001",
      ),
    ).rejects.toThrow("Review document VINs");
    expect(prisma.scooterDocument.create).not.toHaveBeenCalled();
  });
  it("records abandoned uploads for existing cleanup with the completion expiry", async () => {
    const expiresAt = new Date(Date.now() + 60000);
    const uploadTokenExpiresAt = new Date(Date.now() + 86400000);
    storage.createPresignedDocumentUpload.mockResolvedValue({
      ...stored,
      expiresAt,
      uploadTokenExpiresAt,
      uploadUrl: "https://example.com/upload",
      uploadToken: "token",
      method: "PUT",
      headers: {},
      maxBytes: 20 * 1024 * 1024,
    });
    const result = await service.createUpload(
      {
        type: "civ",
        contentType: "application/pdf",
        byteSize: 100,
        checksumSha256: stored.checksumSha256,
      },
      "admin",
    );
    expect(prisma.draftUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin",
        purpose: "scooter-document:civ",
        expiresAt: uploadTokenExpiresAt,
      }) as unknown,
    });
    expect(result).not.toHaveProperty("storageKey");
    expect(result.maxBytes).toBe(15 * 1024 * 1024);
  });
  it("atomically claims unexpired unclaimed drafts before creating assets", async () => {
    await service.apply(tx, "scooter", [{ ...draft, stored }], [], "admin");
    expect(prisma.draftUpload.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: "admin",
        cleanupStartedAt: null,
        claimedAt: null,
        purpose: "scooter-document:civ",
        checksumSha256: stored.checksumSha256,
        expiresAt: { gt: expect.any(Date) as Date },
      }) as unknown,
      data: { claimedAt: expect.any(Date) as Date },
    });
    expect(prisma.scooterDocument.create).toHaveBeenCalledTimes(1);
    prisma.draftUpload.updateMany.mockResolvedValue({ count: 0 });
    prisma.scooterDocument.create.mockClear();
    await expect(
      service.apply(tx, "scooter", [{ ...draft, stored }], [], "admin"),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.scooterDocument.create).not.toHaveBeenCalled();
  });
  it("rejects attachments belonging to another scooter and enforces the file limit", async () => {
    prisma.scooterDocument.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.apply(tx, "scooter", [], ["foreign"])).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.scooterDocument.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["foreign"] }, scooterId: "scooter", deletedAt: null },
      data: { deletedAt: expect.any(Date) as Date },
    });
    prisma.scooterDocument.count.mockResolvedValue(20);
    await expect(
      service.apply(tx, "scooter", [{ ...draft, stored }], [], "admin"),
    ).rejects.toThrow("Too many");
  });
  it("prevents streaming deleted or unrelated documents", async () => {
    prisma.scooterDocument.findFirst.mockResolvedValue(null);
    await expect(service.content("scooter", "foreign")).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.scooterDocument.findFirst).toHaveBeenCalledWith({
      where: {
        id: "foreign",
        scooterId: "scooter",
        deletedAt: null,
        scooter: { deletedAt: null },
        asset: { deletedAt: null },
      },
      include: { asset: true, clientCopyAsset: true },
    });
    expect(storage.readDocument).not.toHaveBeenCalled();
  });

  it("stores original extraction with an import file without changing CIV metadata", async () => {
    const extractedData = {
      vin: "RFBV70010A1100233",
      fields: { brandName: "KYMCO", powerKw: 2.68 },
      rawFields: { power: "2,68", empty: "-", unreadable: null },
    };
    await service.apply(
      tx,
      "scooter",
      [{ ...draft, type: "import_document", stored, extractedData }],
      [],
      "admin",
    );
    expect(prisma.scooterDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "import_document",
        extractedData,
      }) as unknown,
    });
  });

  it("updates extraction only on active files belonging to the same scooter", async () => {
    prisma.scooterDocument.updateMany.mockResolvedValue({ count: 1 });
    await service.apply(tx, "scooter", [], [], "admin", [
      { documentId: "doc", extractedData: null },
    ]);
    expect(prisma.scooterDocument.updateMany).toHaveBeenCalledWith({
      where: {
        id: "doc",
        scooterId: "scooter",
        deletedAt: null,
        asset: { deletedAt: null },
      },
      data: { extractedData: Prisma.DbNull },
    });
    prisma.scooterDocument.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.apply(tx, "scooter", [], [], "admin", [
        { documentId: "foreign-or-removed", extractedData: null },
      ]),
    ).rejects.toThrow("Document does not belong");
  });
});
