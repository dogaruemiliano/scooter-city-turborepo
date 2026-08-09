import { v1 } from "@repo/api-shared";

import { toDateOnlyString } from "../../common/dates/date-only";
import type { Prisma } from "../../generated/prisma/client";

export const SCOOTER_SALE_DOCUMENT_INCLUDE = {
  asset: true,
} satisfies Prisma.ScooterSaleDocumentInclude;

export type ScooterSaleDocumentWithAsset =
  Prisma.ScooterSaleDocumentGetPayload<{
    include: typeof SCOOTER_SALE_DOCUMENT_INCLUDE;
  }>;

export function toScooterSaleDocument(
  row: ScooterSaleDocumentWithAsset,
): v1.finance.ScooterSaleDocument {
  return {
    id: row.id,
    scooterSaleId: row.scooterSaleId,
    documentNumber: row.documentNumber,
    issuedOn: toDateOnlyString(row.issuedOn),
    notes: row.notes,
    asset: row.asset
      ? {
          assetId: row.asset.id,
          contentType: v1.finance.scooterSaleDocumentContentTypeSchema.parse(
            row.asset.contentType,
          ),
          byteSize: row.asset.byteSize,
          checksumSha256: row.asset.checksumSha256,
          imageWidth: row.imageWidth,
          imageHeight: row.imageHeight,
          pageCount: row.pageCount,
          contentUrl: v1.finance.SCOOTER_SALE_ROUTES.document.content(
            row.scooterSaleId,
          ),
        }
      : null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
