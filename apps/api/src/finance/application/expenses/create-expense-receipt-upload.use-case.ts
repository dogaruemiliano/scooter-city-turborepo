import { Injectable } from "@nestjs/common";
import type { v1 } from "@repo/api-shared";

import { ImageStorageService } from "../../../image-storage/image-storage.service";
import { PrismaService } from "../../../prisma/prisma.service";

export const EXPENSE_RECEIPT_DRAFT_PURPOSE = "finance-expense-document";

export function expenseReceiptUploadScope(userId: string): string {
  return `${EXPENSE_RECEIPT_DRAFT_PURPOSE}:${userId}`;
}

@Injectable()
export class CreateExpenseReceiptUploadUseCase {
  constructor(
    private readonly imageStorage: ImageStorageService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    input: v1.finance.CreateExpenseReceiptDraftUploadInput,
    userId: string,
  ): Promise<v1.finance.ExpenseReceiptDraftUpload> {
    const upload = await this.imageStorage.createPresignedUpload({
      ...input,
      category: "expense-invoice",
      scope: expenseReceiptUploadScope(userId),
    });

    await this.prisma.draftUpload.create({
      data: {
        user: { connect: { id: userId } },
        provider: upload.provider,
        bucket: upload.bucket,
        storageKey: upload.storageKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256.trim().toLowerCase(),
        purpose: EXPENSE_RECEIPT_DRAFT_PURPOSE,
        expiresAt: upload.expiresAt,
      },
    });

    return {
      uploadUrl: upload.uploadUrl,
      uploadToken: upload.uploadToken,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
      maxBytes: upload.maxBytes,
    };
  }
}
