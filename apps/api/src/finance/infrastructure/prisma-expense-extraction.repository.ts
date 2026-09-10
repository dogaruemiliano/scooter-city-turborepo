import { Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";

import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type FinanceLegalIdentityRecord = Awaited<
  ReturnType<PrismaExpenseExtractionRepository["findCompanyIdentity"]>
>;

@Injectable()
export class PrismaExpenseExtractionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCompanyIdentity() {
    return this.prisma.financeLegalIdentity.findFirst({
      where: { book: { type: "COMPANY" } },
    });
  }

  async upsertCompanyIdentity(input: {
    bookId: string;
    legalName: string;
    normalizedLegalName: string;
    taxIdentifier: string;
    normalizedTaxIdentifier: string;
    nameAliases: string[];
    countryCode: string;
  }) {
    return this.prisma.financeLegalIdentity.upsert({
      where: { bookId: input.bookId },
      create: input,
      update: {
        legalName: input.legalName,
        normalizedLegalName: input.normalizedLegalName,
        taxIdentifier: input.taxIdentifier,
        normalizedTaxIdentifier: input.normalizedTaxIdentifier,
        nameAliases: input.nameAliases,
        countryCode: input.countryCode,
      },
    });
  }

  findCompanyBook() {
    return this.prisma.financeBook.findUnique({
      where: { type: "COMPANY" },
      select: { id: true },
    });
  }

  findAvailableSourceUploadByFile(input: {
    ownerUserId: string;
    provider: string;
    bucket: string;
    storageKey: string;
    contentType: string;
    byteSize: number;
    checksumSha256: string;
  }) {
    return this.prisma.draftUpload.findFirst({
      where: {
        userId: input.ownerUserId,
        provider: input.provider,
        bucket: input.bucket,
        storageKey: input.storageKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        purpose: "finance-expense-document",
        claimedAt: null,
        cleanupStartedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
  }

  async beginDraft(input: {
    ownerUserId: string;
    sourceUploadId: string;
    provider: string;
    parserVersion: string;
    sourceUploadPurpose: string;
    availableAt: Date;
    retainUntil: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.expenseExtractionDraft.findUnique({
        where: { sourceUploadId: input.sourceUploadId },
      });
      if (existing && existing.ownerUserId !== input.ownerUserId) {
        return null;
      }

      const retainedUpload = await tx.draftUpload.updateMany({
        where: {
          id: input.sourceUploadId,
          userId: input.ownerUserId,
          purpose: input.sourceUploadPurpose,
          claimedAt: null,
          cleanupStartedAt: null,
          expiresAt: { gt: input.availableAt },
        },
        data: { expiresAt: input.retainUntil },
      });

      if (retainedUpload.count !== 1) {
        return null;
      }

      if (existing?.status === "READY") {
        return { draft: existing, shouldAnalyze: false } as const;
      }

      const draft = await tx.expenseExtractionDraft.upsert({
        where: { sourceUploadId: input.sourceUploadId },
        create: {
          ownerUserId: input.ownerUserId,
          sourceUploadId: input.sourceUploadId,
          provider: input.provider,
          parserVersion: input.parserVersion,
          status: "ANALYZING",
        },
        update: {
          status: "ANALYZING",
          provider: input.provider,
          parserVersion: input.parserVersion,
          providerRequestId: null,
          result: Prisma.DbNull,
          failureCode: null,
          failureMessage: null,
        },
      });
      return { draft, shouldAnalyze: true } as const;
    });
  }

  completeDraft(
    draftId: string,
    ownerUserId: string,
    input: {
      provider: string;
      providerRequestId: string | null;
      result: v1.finance.NormalizedExpenseExtraction;
    },
  ) {
    return this.prisma.expenseExtractionDraft.updateMany({
      where: { id: draftId, ownerUserId, status: "ANALYZING" },
      data: {
        status: "READY",
        provider: input.provider,
        providerRequestId: input.providerRequestId,
        result: input.result,
        failureCode: null,
        failureMessage: null,
      },
    });
  }

  failDraft(
    draftId: string,
    ownerUserId: string,
    input: { code: string; message: string },
  ) {
    return this.prisma.expenseExtractionDraft.updateMany({
      where: { id: draftId, ownerUserId, status: "ANALYZING" },
      data: {
        status: "FAILED",
        result: Prisma.DbNull,
        failureCode: input.code,
        failureMessage: input.message,
      },
    });
  }

  findDraftForOwner(draftId: string, ownerUserId: string) {
    return this.prisma.expenseExtractionDraft.findFirst({
      where: { id: draftId, ownerUserId },
    });
  }
}
