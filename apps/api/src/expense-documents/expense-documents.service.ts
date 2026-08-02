import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { toDateOnlyDate } from "../common/dates/date-only";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type {
  PresignedDocumentUpload,
  StoredDocument,
} from "../image-storage/image-storage.types";
import { PrismaService } from "../prisma/prisma.service";
import {
  EXPENSE_DOCUMENT_INCLUDE,
  type ExpenseDocumentWithAssets,
} from "./expense-document.mapper";
import {
  assertExpenseDocumentAssetRoleAvailable,
  assertExpenseDocumentMetadataPolicy,
  expenseDocumentUploadScope,
} from "./expense-document.policy";

@Injectable()
export class ExpenseDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imageStorage: ImageStorageService,
  ) {}

  async list(expenseId: string): Promise<ExpenseDocumentWithAssets[]> {
    await this.requireExpense(expenseId);
    return this.prisma.expenseDocument.findMany({
      where: { expenseId },
      include: EXPENSE_DOCUMENT_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async get(
    expenseId: string,
    documentId: string,
  ): Promise<ExpenseDocumentWithAssets> {
    const document = await this.find(expenseId, documentId);
    if (!document) throw new NotFoundException("Expense document not found");
    return document;
  }

  async create(
    expenseId: string,
    input: v1.finance.CreateExpenseDocumentInput,
    reviewedByUserId: string,
  ): Promise<ExpenseDocumentWithAssets> {
    const expense = await this.requireDraftEvidenceExpense(expenseId);
    assertExpenseDocumentMetadataPolicy({
      ...input,
      expectedBuyerTaxIdentifier: expense.buyerTaxIdentifier,
    });

    return this.prisma.expenseDocument.create({
      data: {
        expense: { connect: { id: expenseId } },
        type: input.type,
        documentSeries: input.documentSeries,
        documentNumber: input.documentNumber,
        supplierName: input.supplierName,
        supplierTaxIdentifier: input.supplierTaxIdentifier,
        buyerTaxIdentifier: input.buyerTaxIdentifier,
        issuedOn: toDateOnlyDate(input.issuedOn),
        buyerCuiStatus: input.buyerCuiStatus,
        reviewStatus: input.reviewStatus,
        notes: input.notes,
        ...(input.reviewStatus !== "PENDING"
          ? {
              reviewedBy: { connect: { id: reviewedByUserId } },
              reviewedAt: new Date(),
            }
          : {}),
      },
      include: EXPENSE_DOCUMENT_INCLUDE,
    });
  }

  async update(
    expenseId: string,
    documentId: string,
    input: v1.finance.UpdateExpenseDocumentInput,
    reviewedByUserId: string,
  ): Promise<ExpenseDocumentWithAssets> {
    const expense = await this.requireDraftEvidenceExpense(expenseId);
    const current = await this.get(expenseId, documentId);
    assertExpenseDocumentMetadataPolicy({
      type: input.type ?? current.type,
      buyerCuiStatus: input.buyerCuiStatus ?? current.buyerCuiStatus,
      buyerTaxIdentifier:
        input.buyerTaxIdentifier !== undefined
          ? input.buyerTaxIdentifier
          : current.buyerTaxIdentifier,
      expectedBuyerTaxIdentifier: expense.buyerTaxIdentifier,
    });

    return this.prisma.expenseDocument.update({
      where: { id: current.id },
      data: {
        type: input.type,
        documentSeries: input.documentSeries,
        documentNumber: input.documentNumber,
        supplierName: input.supplierName,
        supplierTaxIdentifier: input.supplierTaxIdentifier,
        buyerTaxIdentifier: input.buyerTaxIdentifier,
        issuedOn:
          input.issuedOn === undefined
            ? undefined
            : toDateOnlyDate(input.issuedOn),
        buyerCuiStatus: input.buyerCuiStatus,
        reviewStatus: input.reviewStatus,
        notes: input.notes,
        ...(input.reviewStatus === "PENDING"
          ? { reviewedBy: { disconnect: true }, reviewedAt: null }
          : input.reviewStatus
            ? {
                reviewedBy: { connect: { id: reviewedByUserId } },
                reviewedAt: new Date(),
              }
            : {}),
      },
      include: EXPENSE_DOCUMENT_INCLUDE,
    });
  }

  async delete(expenseId: string, documentId: string): Promise<void> {
    const expense = await this.requireExpense(expenseId);
    if (expense.status !== "DRAFT") {
      throw new ConflictException(
        "Only draft expense documents can be deleted",
      );
    }
    const document = await this.get(expenseId, documentId);
    const assetIds = document.assets.map((link) => link.assetId);
    const storageKeys = document.assets.map((link) => link.asset.storageKey);

    await this.prisma.$transaction([
      this.prisma.expenseDocument.delete({ where: { id: documentId } }),
      this.prisma.mediaAsset.updateMany({
        where: { id: { in: assetIds } },
        data: { deletedAt: new Date() },
      }),
    ]);

    await Promise.all(
      storageKeys.map((storageKey) =>
        this.deleteStoredDocumentBestEffort(storageKey),
      ),
    );
  }

  async createUploadUrl(
    expenseId: string,
    documentId: string,
    roleInput: string,
    input: v1.finance.CreateExpenseDocumentUploadUrlInput,
    uploadedByUserId: string,
  ): Promise<v1.finance.ExpenseDocumentUploadUrl> {
    await this.requireAppendableEvidenceExpense(expenseId);
    const role = this.requireAssetRole(roleInput);
    const document = await this.get(expenseId, documentId);
    assertExpenseDocumentAssetRoleAvailable(
      document.assets.map((asset) => asset.role),
      role,
    );

    const upload = await this.imageStorage.createPresignedDocumentUpload({
      ...input,
      scope: expenseDocumentUploadScope({
        expenseId,
        documentId,
        role,
        uploadedByUserId,
      }),
    });
    return this.toPublicUploadUrl(upload);
  }

  async completeUpload(
    expenseId: string,
    documentId: string,
    roleInput: string,
    input: v1.finance.CompleteExpenseDocumentUploadInput,
    uploadedByUserId: string,
  ): Promise<ExpenseDocumentWithAssets> {
    await this.requireAppendableEvidenceExpense(expenseId);
    const role = this.requireAssetRole(roleInput);
    await this.get(expenseId, documentId);

    const stored = await this.imageStorage.completePresignedDocumentUpload(
      input.uploadToken,
      expenseDocumentUploadScope({
        expenseId,
        documentId,
        role,
        uploadedByUserId,
      }),
    );

    try {
      await this.attachStoredDocument(
        expenseId,
        documentId,
        role,
        stored,
        uploadedByUserId,
      );
    } catch (error) {
      const claimed = await this.isStoredDocumentClaimed(stored.storageKey);
      if (!claimed) {
        await this.deleteStoredDocumentBestEffort(stored.storageKey);
      }

      const roleClaimed = await this.prisma.expenseDocumentAsset.findUnique({
        where: { documentId_role: { documentId, role } },
        select: { id: true },
      });
      if (roleClaimed) {
        throw new ConflictException(
          `The expense document already has a ${role.toLowerCase()} asset`,
        );
      }
      if (claimed) {
        throw new BadRequestException("Document upload token was already used");
      }
      throw error;
    }

    return this.get(expenseId, documentId);
  }

  async getContent(
    expenseId: string,
    documentId: string,
    roleInput: string,
  ): Promise<{
    body: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number | null;
  }> {
    const role = this.requireAssetRole(roleInput);
    const link = await this.prisma.expenseDocumentAsset.findFirst({
      where: {
        documentId,
        role,
        document: { expenseId },
        asset: { deletedAt: null },
      },
      include: { asset: true },
    });
    if (!link) throw new NotFoundException("Expense document asset not found");

    const content = await this.imageStorage.readDocument(link.asset.storageKey);
    const contentType = v1.finance.expenseDocumentContentTypeSchema.safeParse(
      link.asset.contentType,
    );
    if (
      !contentType.success ||
      (content.contentType !== null && content.contentType !== contentType.data)
    ) {
      throw new InternalServerErrorException(
        "Stored expense document content type does not match its metadata",
      );
    }
    return {
      body: content.body,
      contentType: contentType.data,
      contentLength: content.contentLength,
    };
  }

  private async attachStoredDocument(
    expenseId: string,
    documentId: string,
    role: v1.finance.ExpenseDocumentAssetRole,
    stored: StoredDocument,
    uploadedByUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const document = await tx.expenseDocument.findFirst({
        where: { id: documentId, expenseId },
        select: {
          id: true,
          expense: { select: { status: true } },
          assets: { select: { role: true } },
        },
      });
      if (!document) throw new NotFoundException("Expense document not found");
      if (document.expense.status === "REVERSED") {
        throw new ConflictException(
          "Files cannot be appended to a reversed expense",
        );
      }
      assertExpenseDocumentAssetRoleAvailable(
        document.assets.map((asset) => asset.role),
        role,
      );

      const existingRole = await tx.expenseDocumentAsset.findUnique({
        where: { documentId_role: { documentId, role } },
        select: { id: true },
      });
      if (existingRole) {
        throw new ConflictException(
          `The expense document already has a ${role.toLowerCase()} asset`,
        );
      }

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
      await tx.expenseDocumentAsset.create({
        data: {
          document: { connect: { id: documentId } },
          asset: { connect: { id: asset.id } },
          role,
          imageWidth: stored.imageWidth,
          imageHeight: stored.imageHeight,
          pageCount: stored.pageCount,
        },
      });
    });
  }

  private async find(
    expenseId: string,
    documentId: string,
  ): Promise<ExpenseDocumentWithAssets | null> {
    return this.prisma.expenseDocument.findFirst({
      where: { id: documentId, expenseId },
      include: EXPENSE_DOCUMENT_INCLUDE,
    });
  }

  private async requireExpense(expenseId: string): Promise<{
    id: string;
    status: v1.finance.ExpenseStatus;
    buyerTaxIdentifier: string | null;
  }> {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        status: true,
        legalEntity: {
          select: { company: { select: { taxIdentifier: true } } },
        },
      },
    });
    if (!expense) throw new NotFoundException("Expense not found");
    return {
      id: expense.id,
      status: expense.status,
      buyerTaxIdentifier: expense.legalEntity.company.taxIdentifier,
    };
  }

  private async requireDraftEvidenceExpense(expenseId: string) {
    const expense = await this.requireExpense(expenseId);
    if (expense.status !== "DRAFT") {
      throw new ConflictException(
        "Fiscal evidence metadata can only be changed on a draft expense",
      );
    }
    return expense;
  }

  private async requireAppendableEvidenceExpense(expenseId: string) {
    const expense = await this.requireExpense(expenseId);
    if (expense.status === "REVERSED") {
      throw new ConflictException(
        "Files cannot be appended to a reversed expense",
      );
    }
    return expense;
  }

  private requireAssetRole(role: string): v1.finance.ExpenseDocumentAssetRole {
    const parsed = v1.finance.expenseDocumentAssetRoleSchema.safeParse(role);
    if (!parsed.success) {
      throw new BadRequestException("Invalid expense document asset role");
    }
    return parsed.data;
  }

  private toPublicUploadUrl(
    upload: PresignedDocumentUpload,
  ): v1.finance.ExpenseDocumentUploadUrl {
    return {
      uploadUrl: upload.uploadUrl,
      uploadToken: upload.uploadToken,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
      maxBytes: upload.maxBytes,
    };
  }

  private async isStoredDocumentClaimed(storageKey: string): Promise<boolean> {
    try {
      return Boolean(
        await this.prisma.mediaAsset.findUnique({
          where: { storageKey },
          select: { id: true },
        }),
      );
    } catch {
      // If commit state cannot be established, retain the private object. A
      // retention job can remove an orphan without risking claimed evidence.
      return true;
    }
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
