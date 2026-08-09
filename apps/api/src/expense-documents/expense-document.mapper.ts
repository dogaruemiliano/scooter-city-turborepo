import { v1 } from "@repo/api-shared";

import type { Prisma } from "../generated/prisma/client";
import { toDateOnlyString } from "../common/dates/date-only";

export const EXPENSE_DOCUMENT_INCLUDE = {
  assets: {
    include: { asset: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ExpenseDocumentInclude;

export type ExpenseDocumentWithAssets = Prisma.ExpenseDocumentGetPayload<{
  include: typeof EXPENSE_DOCUMENT_INCLUDE;
}>;

export function toExpenseDocument(
  row: ExpenseDocumentWithAssets,
): v1.finance.ExpenseDocument {
  return {
    id: row.id,
    type: row.type,
    documentSeries: row.documentSeries,
    documentNumber: row.documentNumber,
    supplierName: row.supplierName,
    supplierTaxIdentifier: row.supplierTaxIdentifier,
    buyerTaxIdentifier: row.buyerTaxIdentifier,
    issuedOn: toDateOnlyString(row.issuedOn),
    buyerCuiStatus: row.buyerCuiStatus,
    reviewStatus: row.reviewStatus,
    notes: row.notes,
    assets: row.assets.map((link) => ({
      id: link.id,
      assetId: link.assetId,
      role: link.role,
      contentType: v1.finance.expenseDocumentContentTypeSchema.parse(
        link.asset.contentType,
      ),
      byteSize: link.asset.byteSize,
      checksumSha256: link.asset.checksumSha256,
      imageWidth: link.imageWidth,
      imageHeight: link.imageHeight,
      pageCount: link.pageCount,
      contentUrl: v1.finance.EXPENSE_ROUTES.documents.content(
        row.expenseId,
        row.id,
        link.role,
      ),
      createdAt: link.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
