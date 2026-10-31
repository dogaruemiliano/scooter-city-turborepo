import { assertVehicleDocumentsMutable } from "./scooter-contract-evidence";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { toDateOnlyString } from "../common/dates/date-only";
import { v1 } from "@repo/api-shared";
import { Prisma } from "../generated/prisma/client";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  requireOpenEditorSession,
  saveEditorSession,
  UPLOAD_WRITE_GRACE_MS,
} from "../scooter-document-jobs/document-job-lifecycle";

const purpose = (type: v1.scooters.ScooterDocumentUploadType) =>
  `scooter-document:${type}`;
const scope = (userId: string, type: v1.scooters.ScooterDocumentUploadType) =>
  `${purpose(type)}:${userId}`;
type Prepared = v1.scooters.ScooterDocumentDraft & {
  stored: StoredDocument;
  clientCopyStored?: StoredDocument;
};

@Injectable()
export class ScooterDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorageService,
  ) {}

  async createUpload(
    input: v1.scooters.CreateScooterDocumentUpload,
    userId: string,
  ) {
    const upload = await this.storage.createPresignedDocumentUpload({
      ...input,
      category: "scooter-document",
      scope: scope(userId, input.type),
      completionTokenTtlSeconds: 86_400,
    });
    const data = {
      userId,
      provider: upload.provider,
      bucket: upload.bucket,
      storageKey: upload.storageKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
      purpose: purpose(input.type),
      expiresAt: upload.uploadTokenExpiresAt ?? upload.expiresAt,
    };
    if (input.sessionId) {
      await this.prisma.$transaction(async (tx) => {
        const session = await requireOpenEditorSession(
          tx,
          input.sessionId!,
          userId,
        );
        const writeSafeAfter = new Date(
          upload.expiresAt.getTime() + UPLOAD_WRITE_GRACE_MS,
        );
        const draft = await tx.draftUpload.create({
          data: {
            ...data,
            editorSessionId: session.id,
            uploadUrlExpiresAt: upload.expiresAt,
            writeSafeAfter,
          },
        });
        await tx.scooterDocumentResource.create({
          data: {
            identity: `s3:${upload.bucket}:${upload.storageKey}`,
            sessionId: session.id,
            draftUploadId: draft.id,
            kind: "original",
            bucket: upload.bucket,
            storageKey: upload.storageKey,
            lastPossibleWriteAt: writeSafeAfter,
            cleanupAfter: data.expiresAt,
          },
        });
      });
    } else
      await this.prisma.draftUpload.create({
        data: {
          ...data,
        },
      });
    return {
      uploadUrl: upload.uploadUrl,
      uploadToken: upload.uploadToken,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
      maxBytes: Math.min(
        upload.maxBytes,
        v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
      ),
    };
  }

  async prepare(
    drafts: v1.scooters.ScooterDocumentDraft[] = [],
    userId?: string,
  ): Promise<Prepared[]> {
    if (drafts.length && !userId)
      throw new BadRequestException("Upload owner is required");
    const prepared: Prepared[] = [];
    const keys = new Set<string>();
    for (const draft of drafts) {
      const stored = await this.storage.completePresignedDocumentUpload(
        draft.uploadToken,
        scope(userId!, draft.uploadType ?? draft.type),
      );
      if (keys.has(stored.storageKey))
        throw new BadRequestException("Duplicate document upload");
      keys.add(stored.storageKey);
      const clientCopyStored = draft.clientCopy
        ? await this.storage.completePresignedDocumentUpload(
            draft.clientCopy.uploadToken,
            scope(userId!, draft.clientCopy.uploadType),
          )
        : undefined;
      if (clientCopyStored) {
        if (keys.has(clientCopyStored.storageKey))
          throw new BadRequestException("Duplicate document version upload");
        keys.add(clientCopyStored.storageKey);
      }
      prepared.push({ ...draft, stored, clientCopyStored });
    }
    return prepared;
  }

  /** Resolve extraction sources without consuming or attaching staged uploads. */
  async resolveAnalysisSource(
    source: v1.scooters.AnalyzeScooterDocumentInput["source"],
    userId: string,
  ): Promise<{
    documentType: v1.scooters.ScooterDocumentUploadType;
    stored: StoredDocument;
    draftUploadId?: string;
    documentId?: string;
    scooterId?: string;
  }> {
    if (source.kind === "draft") {
      const stored = this.storage.verifyDocumentUploadToken(
        source.uploadToken,
        scope(userId, source.uploadType ?? source.type),
      );
      const draft = await this.prisma.draftUpload.findFirst({
        where: {
          userId,
          purpose: purpose(source.uploadType ?? source.type),
          storageKey: stored.storageKey,
          provider: stored.provider,
          bucket: stored.bucket,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
          expiresAt: { gt: new Date() },
          claimedAt: null,
          cleanupStartedAt: null,
        },
        select: { id: true },
      });
      if (!draft)
        throw new BadRequestException(
          "Document upload is not available. Upload it again.",
        );
      return { documentType: source.type, stored, draftUploadId: draft.id };
    }
    const document = await this.prisma.scooterDocument.findFirst({
      where: {
        id: source.documentId,
        scooterId: source.scooterId,
        deletedAt: null,
        scooter: { deletedAt: null },
        asset: { deletedAt: null },
      },
      include: { asset: true },
    });
    if (!document) throw new NotFoundException("Document not found");
    const asset = document.asset;
    if (
      asset.provider !== "s3" ||
      !v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES.includes(
        asset.contentType as (typeof v1.scooters.SCOOTER_DOCUMENT_CONTENT_TYPES)[number],
      )
    )
      throw new BadRequestException("Unsupported document storage metadata");
    return {
      documentType: document.type,
      documentId: document.id,
      scooterId: document.scooterId,
      stored: {
        provider: "s3",
        bucket: asset.bucket,
        storageKey: asset.storageKey,
        contentType: asset.contentType as StoredDocument["contentType"],
        byteSize: asset.byteSize,
        checksumSha256: asset.checksumSha256,
        imageWidth: null,
        imageHeight: null,
        pageCount: null,
      },
    };
  }

  // The caller writes the scooter first, serializing concurrent document changes.
  async apply(
    tx: Prisma.TransactionClient,
    scooterId: string,
    prepared: Prepared[],
    removedIds: string[] = [],
    userId?: string,
    extractions: v1.scooters.ScooterDocumentExtractionUpdate[] = [],
    sessionId?: string,
    saveFingerprint?: string,
    scooterVin?: string,
  ) {
    if (scooterVin) {
      for (const { evidence, type } of [
        ...prepared.map((document) => ({
          evidence: document.extractedData,
          type: document.type,
        })),
        ...extractions.map((document) => ({
          evidence: document.extractedData,
          type: "unknown",
        })),
      ]) {
        const vins = evidence?.documents?.length
          ? evidence.documents
              .filter((document) =>
                v1.scooters.scooterDocumentReadsVin(document.documentType),
              )
              .map((document) => document.vin)
          : v1.scooters.scooterDocumentReadsVin(type)
            ? [evidence?.vin]
            : [];
        if (vins.some((vin) => vin && vin !== scooterVin))
          throw new BadRequestException({
            code: "DOCUMENT_VIN_MISMATCH",
            message:
              "Review document VINs before attaching them to this scooter.",
          });
      }
    }
    await saveEditorSession(tx, sessionId, userId, scooterId, saveFingerprint);
    const ids = [...new Set(removedIds)];
    if (ids.length) {
      await assertVehicleDocumentsMutable(tx, scooterId, ids);
      const inspection = await tx.scooterItpInspection.findFirst({
        where: {
          scooterId,
          OR: [
            { cardDocumentId: { in: ids } },
            { certificateDocumentId: { in: ids } },
          ],
        },
        select: { id: true },
      });
      if (inspection)
        throw new BadRequestException({
          code: "ITP_EVIDENCE_IN_USE",
          message:
            "Keep documents supporting a confirmed inspection. Add renewal scans without removing the historical evidence.",
        });
      const removed = await tx.scooterDocument.updateMany({
        where: { id: { in: ids }, scooterId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (removed.count !== ids.length)
        throw new BadRequestException(
          "Document does not belong to this scooter or was removed",
        );
    }
    for (const { documentId, extractedData } of extractions) {
      const updated = await tx.scooterDocument.updateMany({
        where: {
          id: documentId,
          scooterId,
          deletedAt: null,
          asset: { deletedAt: null },
        },
        data: { extractedData: extractedData ?? Prisma.DbNull },
      });
      if (updated.count !== 1)
        throw new BadRequestException(
          "Document does not belong to this scooter or was removed",
        );
    }
    if (!prepared.length) return;
    const count = await tx.scooterDocument.count({
      where: { scooterId, deletedAt: null },
    });
    if (
      count +
        prepared.filter((document) => !document.originalDocumentId).length >
      v1.scooters.SCOOTER_DOCUMENT_MAX_FILES
    )
      throw new BadRequestException("Too many scooter documents");
    for (const {
      stored,
      type,
      fileName,
      insurancePolicyId,
      extractedData,
      uploadType,
      clientCopy,
      clientCopyStored,
      originalDocumentId,
    } of prepared) {
      const hasInsurance = extractedData?.documents?.length
        ? extractedData.documents.some(
            (document) => document.documentType === "insurance",
          )
        : type === "insurance";
      if (
        !originalDocumentId &&
        hasInsurance &&
        insurancePolicyId &&
        extractedData?.currentInsuranceDocumentId !== null
      ) {
        if (
          !(await tx.scooterInsurancePolicy.findFirst({
            where: { id: insurancePolicyId, scooterId, deletedAt: null },
            select: { id: true },
          }))
        )
          throw new BadRequestException(
            "Insurance document must belong to a policy on this scooter",
          );
      } else if (!originalDocumentId && insurancePolicyId)
        throw new BadRequestException(
          "Only documents containing insurance evidence can belong to a policy",
        );
      const now = new Date();
      const versions = [
        { stored, uploadType: uploadType ?? type },
        ...(clientCopyStored && clientCopy
          ? [{ stored: clientCopyStored, uploadType: clientCopy.uploadType }]
          : []),
      ];
      for (const version of versions) {
        const claimed = await tx.draftUpload.updateMany({
          where: {
            storageKey: version.stored.storageKey,
            userId,
            purpose: purpose(version.uploadType),
            claimedAt: null,
            cleanupStartedAt: null,
            editorSessionId: sessionId ?? null,
            expiresAt: { gt: now },
            provider: version.stored.provider,
            bucket: version.stored.bucket,
            contentType: version.stored.contentType,
            byteSize: version.stored.byteSize,
            checksumSha256: version.stored.checksumSha256,
          },
          data: { claimedAt: now },
        });
        if (claimed.count !== 1)
          throw new BadRequestException(
            "Document upload expired or was already used. Upload it again.",
          );
      }
      if (originalDocumentId) {
        const original = await tx.scooterDocument.findFirst({
          where: {
            id: originalDocumentId,
            scooterId,
            deletedAt: null,
            asset: { deletedAt: null },
          },
          include: { clientCopyAsset: true },
        });
        if (
          !original ||
          original.type !== type ||
          (original.clientCopyAsset && !original.clientCopyAsset.deletedAt) ||
          clientCopyStored
        )
          throw new BadRequestException(
            "Choose an original on this scooter without an existing client copy",
          );
        await tx.scooterDocument.update({
          where: { id: originalDocumentId },
          data: {
            clientCopyFileName: fileName,
            clientCopyAsset: {
              create: {
                provider: stored.provider,
                bucket: stored.bucket,
                storageKey: stored.storageKey,
                contentType: stored.contentType,
                byteSize: stored.byteSize,
                checksumSha256: stored.checksumSha256,
                uploadedByUserId: userId,
              },
            },
          },
        });
        if (sessionId)
          await tx.scooterDocumentResource.updateMany({
            where: {
              sessionId,
              storageKey: stored.storageKey,
              kind: "original",
            },
            data: { status: "retained" },
          });
        continue;
      }
      const document = await tx.scooterDocument.create({
        data: {
          scooter: { connect: { id: scooterId } },
          type,
          ...(insurancePolicyId
            ? { insurancePolicy: { connect: { id: insurancePolicyId } } }
            : {}),
          fileName,
          ...(clientCopyStored && clientCopy
            ? {
                clientCopyFileName: clientCopy.fileName,
                clientCopyAsset: {
                  create: {
                    provider: clientCopyStored.provider,
                    bucket: clientCopyStored.bucket,
                    storageKey: clientCopyStored.storageKey,
                    contentType: clientCopyStored.contentType,
                    byteSize: clientCopyStored.byteSize,
                    checksumSha256: clientCopyStored.checksumSha256,
                    uploadedByUserId: userId,
                  },
                },
              }
            : {}),
          extractedData: extractedData === null ? Prisma.DbNull : extractedData,
          asset: {
            create: {
              provider: stored.provider,
              bucket: stored.bucket,
              storageKey: stored.storageKey,
              contentType: stored.contentType,
              byteSize: stored.byteSize,
              checksumSha256: stored.checksumSha256,
              uploadedByUserId: userId,
            },
          },
        },
      });
      if (sessionId) {
        await tx.scooterDocumentJob.updateMany({
          where: {
            sessionId,
            sourceFingerprint: stored.checksumSha256 + ":" + stored.storageKey,
          },
          data: { documentId: document.id, scooterId, draftUploadId: null },
        });
        await tx.scooterDocumentResource.updateMany({
          where: {
            sessionId,
            storageKey: {
              in: versions.map((version) => version.stored.storageKey),
            },
            kind: "original",
          },
          data: { status: "retained" },
        });
      }
    }
  }

  async list(scooterId: string): Promise<v1.scooters.ScooterDocument[]> {
    if (
      !(await this.prisma.scooter.findFirst({
        where: { id: scooterId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Scooter not found");
    const documents = await this.prisma.scooterDocument.findMany({
      where: { scooterId, deletedAt: null, asset: { deletedAt: null } },
      include: { asset: true, clientCopyAsset: true, insurancePolicy: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const inspections = await this.prisma.scooterItpInspection.findMany({
      where: { scooterId },
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
    });
    return documents.map((doc) =>
      v1.scooters.scooterDocumentSchema.parse({
        id: doc.id,
        insurancePolicyId: doc.insurancePolicyId,
        type: doc.type,
        fileName: doc.fileName,
        extractedData: doc.extractedData,
        contentType: doc.asset.contentType,
        byteSize: doc.asset.byteSize,
        createdAt: doc.createdAt.toISOString(),
        validFrom: toDateOnlyString(
          doc.insurancePolicy?.validFrom ??
            inspections.find(
              (inspection) =>
                inspection.cardDocumentId === doc.id ||
                inspection.certificateDocumentId === doc.id,
            )?.inspectionDate ??
            null,
        ),
        validUntil: toDateOnlyString(
          doc.insurancePolicy?.validUntil ??
            inspections.find(
              (inspection) =>
                inspection.cardDocumentId === doc.id ||
                inspection.certificateDocumentId === doc.id,
            )?.validUntil ??
            null,
        ),
        contentUrl: v1.scooters.ROUTES.documents.content(scooterId, doc.id),
        clientCopy:
          doc.clientCopyAsset && !doc.clientCopyAsset.deletedAt
            ? {
                fileName: doc.clientCopyFileName,
                contentType: doc.clientCopyAsset.contentType,
                byteSize: doc.clientCopyAsset.byteSize,
                contentUrl:
                  v1.scooters.ROUTES.documents.content(scooterId, doc.id) +
                  "?version=client_copy",
              }
            : null,
      }),
    );
  }

  async content(scooterId: string, documentId: string, version?: string) {
    const document = await this.prisma.scooterDocument.findFirst({
      where: {
        id: documentId,
        scooterId,
        deletedAt: null,
        scooter: { deletedAt: null },
        asset: { deletedAt: null },
      },
      include: { asset: true, clientCopyAsset: true },
    });
    if (!document) throw new NotFoundException("Document not found");
    if (version && version !== "client_copy")
      throw new BadRequestException("Unknown document version");
    const asset =
      version === "client_copy" ? document.clientCopyAsset : document.asset;
    if (!asset || asset.deletedAt)
      throw new NotFoundException("Document version not found");
    return {
      ...(await this.storage.readDocument(asset.storageKey)),
      contentType: asset.contentType,
    };
  }
}
