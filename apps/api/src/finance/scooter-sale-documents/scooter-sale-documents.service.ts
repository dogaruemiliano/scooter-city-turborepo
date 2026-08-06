import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toDateOnlyDate } from "../../common/dates/date-only";
import { ImageStorageService } from "../../image-storage/image-storage.service";
import type { PresignedDocumentUpload } from "../../image-storage/image-storage.types";
import { PrismaService } from "../../prisma/prisma.service";
import {
  SCOOTER_SALE_DOCUMENT_INCLUDE,
  type ScooterSaleDocumentWithAsset,
} from "./scooter-sale-document.mapper";
import { scooterSaleDocumentUploadScope } from "./scooter-sale-document.policy";

@Injectable()
export class ScooterSaleDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  async get(scooterSaleId: string): Promise<ScooterSaleDocumentWithAsset> {
    const document = await this.find(scooterSaleId);
    if (!document)
      throw new NotFoundException("Scooter sale document not found");
    return document;
  }

  async upsert(
    scooterSaleId: string,
    input: v1.finance.UpsertScooterSaleDocumentInput,
    actorUserId: string,
  ): Promise<ScooterSaleDocumentWithAsset> {
    await this.requireSale(scooterSaleId);
    await this.prisma.scooterSaleDocument.upsert({
      where: { scooterSaleId },
      create: {
        scooterSale: { connect: { id: scooterSaleId } },
        documentNumber: input.documentNumber,
        issuedOn: toDateOnlyDate(input.issuedOn),
        notes: input.notes,
        createdBy: { connect: { id: actorUserId } },
      },
      update: {
        documentNumber: input.documentNumber,
        issuedOn:
          input.issuedOn === undefined
            ? undefined
            : toDateOnlyDate(input.issuedOn),
        notes: input.notes,
      },
    });
    return this.get(scooterSaleId);
  }

  async createUploadUrl(
    scooterSaleId: string,
    input: v1.finance.CreateScooterSaleDocumentUploadUrlInput,
    uploadedByUserId: string,
  ): Promise<v1.finance.ScooterSaleDocumentUploadUrl> {
    await this.requireSale(scooterSaleId);
    await this.ensureDocument(scooterSaleId, uploadedByUserId);

    const upload = await this.imageStorage.createPresignedDocumentUpload({
      ...input,
      scope: scooterSaleDocumentUploadScope({
        scooterSaleId,
        uploadedByUserId,
      }),
    });
    return this.toPublicUploadUrl(upload);
  }

  async completeUpload(
    scooterSaleId: string,
    input: v1.finance.CompleteScooterSaleDocumentUploadInput,
    uploadedByUserId: string,
  ): Promise<ScooterSaleDocumentWithAsset> {
    await this.requireSale(scooterSaleId);
    const document = await this.ensureDocument(scooterSaleId, uploadedByUserId);

    const stored = await this.imageStorage.completePresignedDocumentUpload(
      input.uploadToken,
      scooterSaleDocumentUploadScope({ scooterSaleId, uploadedByUserId }),
    );

    const previousAssetId = document.assetId;
    const previousStorageKey = document.asset?.storageKey ?? null;

    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          provider: stored.provider,
          bucket: stored.bucket,
          storageKey: stored.storageKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
          uploadedByUser: { connect: { id: uploadedByUserId } },
        },
      });
      await tx.scooterSaleDocument.update({
        where: { scooterSaleId },
        data: {
          assetId: asset.id,
          imageWidth: stored.imageWidth,
          imageHeight: stored.imageHeight,
          pageCount: stored.pageCount,
        },
      });
      if (previousAssetId) {
        await tx.mediaAsset.update({
          where: { id: previousAssetId },
          data: { deletedAt: new Date() },
        });
      }
    });

    if (previousStorageKey) {
      await this.deleteStoredDocumentBestEffort(previousStorageKey);
    }

    return this.get(scooterSaleId);
  }

  async getContent(scooterSaleId: string): Promise<{
    body: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number | null;
  }> {
    const document = await this.prisma.scooterSaleDocument.findUnique({
      where: { scooterSaleId },
      include: { asset: true },
    });
    if (!document?.asset || document.asset.deletedAt) {
      throw new NotFoundException("Scooter sale document asset not found");
    }

    const content = await this.imageStorage.readDocument(
      document.asset.storageKey,
    );
    const contentType =
      v1.finance.scooterSaleDocumentContentTypeSchema.safeParse(
        document.asset.contentType,
      );
    if (
      !contentType.success ||
      (content.contentType !== null && content.contentType !== contentType.data)
    ) {
      throw new InternalServerErrorException(
        "Stored scooter sale document content type does not match its metadata",
      );
    }
    return {
      body: content.body,
      contentType: contentType.data,
      contentLength: content.contentLength,
    };
  }

  private async ensureDocument(
    scooterSaleId: string,
    actorUserId: string,
  ): Promise<ScooterSaleDocumentWithAsset> {
    const existing = await this.find(scooterSaleId);
    if (existing) return existing;
    await this.prisma.scooterSaleDocument.create({
      data: {
        scooterSale: { connect: { id: scooterSaleId } },
        createdBy: { connect: { id: actorUserId } },
      },
    });
    return this.get(scooterSaleId);
  }

  private async find(
    scooterSaleId: string,
  ): Promise<ScooterSaleDocumentWithAsset | null> {
    return this.prisma.scooterSaleDocument.findUnique({
      where: { scooterSaleId },
      include: SCOOTER_SALE_DOCUMENT_INCLUDE,
    });
  }

  private async requireSale(scooterSaleId: string): Promise<void> {
    const sale = await this.prisma.scooterSale.findUnique({
      where: { id: scooterSaleId },
      select: { id: true },
    });
    if (!sale) throw new NotFoundException("Scooter sale not found");
  }

  private toPublicUploadUrl(
    upload: PresignedDocumentUpload,
  ): v1.finance.ScooterSaleDocumentUploadUrl {
    return {
      uploadUrl: upload.uploadUrl,
      uploadToken: upload.uploadToken,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
      maxBytes: upload.maxBytes,
    };
  }

  private async deleteStoredDocumentBestEffort(
    storageKey: string,
  ): Promise<void> {
    try {
      await this.imageStorage.deleteDocument(storageKey);
    } catch {
      // Database state remains authoritative. Retention tooling can retry a
      // private-object cleanup after a transient S3 failure.
    }
  }
}
