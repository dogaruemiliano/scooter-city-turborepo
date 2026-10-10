import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import type { Prisma } from "../generated/prisma/client";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";
import { PrismaService } from "../prisma/prisma.service";

const purpose = (type: v1.scooters.ScooterDocumentType) =>
  `scooter-document:${type}`;
const scope = (userId: string, type: v1.scooters.ScooterDocumentType) =>
  `${purpose(type)}:${userId}`;
type Prepared = v1.scooters.ScooterDocumentDraft & { stored: StoredDocument };

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
    await this.prisma.draftUpload.create({
      data: {
        userId,
        provider: upload.provider,
        bucket: upload.bucket,
        storageKey: upload.storageKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        purpose: purpose(input.type),
        expiresAt: upload.uploadTokenExpiresAt ?? upload.expiresAt,
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
        scope(userId!, draft.type),
      );
      if (keys.has(stored.storageKey))
        throw new BadRequestException("Duplicate document upload");
      keys.add(stored.storageKey);
      prepared.push({ ...draft, stored });
    }
    return prepared;
  }

  // The caller writes the scooter first, serializing concurrent document changes.
  async apply(
    tx: Prisma.TransactionClient,
    scooterId: string,
    prepared: Prepared[],
    removedIds: string[] = [],
    userId?: string,
  ) {
    const ids = [...new Set(removedIds)];
    if (ids.length) {
      const removed = await tx.scooterDocument.updateMany({
        where: { id: { in: ids }, scooterId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (removed.count !== ids.length)
        throw new BadRequestException(
          "Document does not belong to this scooter or was removed",
        );
    }
    if (!prepared.length) return;
    const count = await tx.scooterDocument.count({
      where: { scooterId, deletedAt: null },
    });
    if (count + prepared.length > v1.scooters.SCOOTER_DOCUMENT_MAX_FILES)
      throw new BadRequestException("Too many scooter documents");
    for (const { stored, type, fileName } of prepared) {
      const now = new Date();
      const claimed = await tx.draftUpload.updateMany({
        where: {
          storageKey: stored.storageKey,
          userId,
          purpose: purpose(type),
          claimedAt: null,
          cleanupStartedAt: null,
          expiresAt: { gt: now },
          provider: stored.provider,
          bucket: stored.bucket,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
        },
        data: { claimedAt: now },
      });
      if (claimed.count !== 1)
        throw new BadRequestException(
          "Document upload expired or was already used. Upload it again.",
        );
      await tx.scooterDocument.create({
        data: {
          scooter: { connect: { id: scooterId } },
          type,
          fileName,
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
      include: { asset: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return documents.map((doc) =>
      v1.scooters.scooterDocumentSchema.parse({
        id: doc.id,
        type: doc.type,
        fileName: doc.fileName,
        contentType: doc.asset.contentType,
        byteSize: doc.asset.byteSize,
        createdAt: doc.createdAt.toISOString(),
        contentUrl: v1.scooters.ROUTES.documents.content(scooterId, doc.id),
      }),
    );
  }

  async content(scooterId: string, documentId: string) {
    const document = await this.prisma.scooterDocument.findFirst({
      where: {
        id: documentId,
        scooterId,
        deletedAt: null,
        scooter: { deletedAt: null },
        asset: { deletedAt: null },
      },
      include: { asset: true },
    });
    if (!document) throw new NotFoundException("Document not found");
    return {
      ...(await this.storage.readDocument(document.asset.storageKey)),
      contentType: document.asset.contentType,
    };
  }
}
