import { z } from "zod";

import { EXPENSE_DOCUMENT_CONTENT_TYPES } from "./expense.constants";
import {
  aggregateMoneyAmountSchema,
  currencySchema,
  financialCounterpartySearchItemSchema,
  moneyAmountSchema,
  paymentMethodSchema,
  positiveMoneyAmountSchema,
} from "./finance.schemas";
import { SCOOTER_SALE_STATUSES } from "./scooter-sale.constants";

const MAX_NOTES_LENGTH = 2_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_PAGE_SIZE = 100;
const MAX_SCOOTER_IDS = 100;

const idSchema = z.string().trim().min(1);
const dateSchema = z.iso.date();

const optionalText = (max = MAX_NOTES_LENGTH) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().max(max).nullable().optional(),
  );

function moneyMinor(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

const commaSeparatedIdsSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}, z.array(idSchema).max(MAX_SCOOTER_IDS).optional());

export const scooterSaleStatusSchema = z.enum(SCOOTER_SALE_STATUSES);

export const createScooterSaleInputSchema = z
  .object({
    scooterId: idSchema,
    buyerCounterpartyId: idSchema,
    saleAmount: positiveMoneyAmountSchema,
    currency: currencySchema,
    soldOn: dateSchema,
    notes: optionalText(),
  })
  .strict()
  .meta({ id: "CreateScooterSaleInput" });
export type CreateScooterSaleInput = z.infer<
  typeof createScooterSaleInputSchema
>;

export const recordScooterSalePaymentInputSchema = z
  .object({
    businessAmount: moneyAmountSchema,
    personalAmount: moneyAmountSchema,
    personalOwnerUserId: idSchema.optional(),
    paidOn: dateSchema,
    paymentMethod: paymentMethodSchema,
    companyWalletId: idSchema.optional(),
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH),
    notes: optionalText(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const business = moneyMinor(input.businessAmount);
    const personal = moneyMinor(input.personalAmount);
    if (business <= BigInt(0) && personal <= BigInt(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["businessAmount"],
        message:
          "At least one of businessAmount or personalAmount must be greater than zero.",
      });
    }
    if (business > BigInt(0) && !input.companyWalletId) {
      ctx.addIssue({
        code: "custom",
        path: ["companyWalletId"],
        message: "companyWalletId is required when businessAmount is set.",
      });
    }
    if (personal > BigInt(0) && !input.personalOwnerUserId) {
      ctx.addIssue({
        code: "custom",
        path: ["personalOwnerUserId"],
        message: "personalOwnerUserId is required when personalAmount is set.",
      });
    }
  })
  .meta({ id: "RecordScooterSalePaymentInput" });
export type RecordScooterSalePaymentInput = z.infer<
  typeof recordScooterSalePaymentInputSchema
>;

export const cancelScooterSaleInputSchema = z
  .object({
    reason: optionalText(),
  })
  .strict()
  .meta({ id: "CancelScooterSaleInput" });
export type CancelScooterSaleInput = z.infer<
  typeof cancelScooterSaleInputSchema
>;

export const scooterSaleSchema = z
  .object({
    id: idSchema,
    scooterId: idSchema,
    buyerCounterpartyId: idSchema,
    buyer: financialCounterpartySearchItemSchema.nullable(),
    saleAmount: moneyAmountSchema,
    paidAmount: moneyAmountSchema,
    paidBusinessAmount: moneyAmountSchema,
    paidPersonalAmount: moneyAmountSchema,
    outstandingAmount: moneyAmountSchema,
    currency: currencySchema,
    status: scooterSaleStatusSchema,
    soldOn: dateSchema,
    notes: z.string().nullable(),
    createdByUserId: idSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .meta({ id: "ScooterSale" });
export type ScooterSale = z.infer<typeof scooterSaleSchema>;

export const scooterSaleListSchema = z
  .object({
    items: z.array(scooterSaleSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .strict()
  .meta({ id: "ScooterSaleList" });
export type ScooterSaleList = z.infer<typeof scooterSaleListSchema>;

export const listScooterSalesQuerySchema = z
  .object({
    scooterId: idSchema.optional(),
    scooterIds: commaSeparatedIdsSchema,
    buyerCounterpartyId: idSchema.optional(),
    status: scooterSaleStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  })
  .strict()
  .meta({ id: "ListScooterSalesQuery" });
export type ListScooterSalesQuery = z.infer<typeof listScooterSalesQuerySchema>;

export const scooterCostBreakdownRowSchema = z
  .object({
    categoryId: idSchema.nullable(),
    categoryName: z.string().nullable(),
    currency: currencySchema,
    totalAllocatedGrossAmount: aggregateMoneyAmountSchema,
  })
  .strict()
  .meta({ id: "ScooterCostBreakdownRow" });
export type ScooterCostBreakdownRow = z.infer<
  typeof scooterCostBreakdownRowSchema
>;

export const scooterFinancialsSchema = z
  .object({
    scooterId: idSchema,
    costBreakdown: z.array(scooterCostBreakdownRowSchema),
    totalCost: z.array(
      z
        .object({
          currency: currencySchema,
          amount: aggregateMoneyAmountSchema,
        })
        .strict(),
    ),
    sale: scooterSaleSchema.nullable(),
  })
  .strict()
  .meta({ id: "ScooterFinancials" });
export type ScooterFinancials = z.infer<typeof scooterFinancialsSchema>;

const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export const scooterSaleDocumentContentTypeSchema = z.enum(
  EXPENSE_DOCUMENT_CONTENT_TYPES,
);
export type ScooterSaleDocumentContentType = z.infer<
  typeof scooterSaleDocumentContentTypeSchema
>;

export const upsertScooterSaleDocumentInputSchema = z
  .object({
    documentNumber: optionalText(200),
    issuedOn: dateSchema.nullable().optional(),
    notes: optionalText(),
  })
  .strict()
  .meta({ id: "UpsertScooterSaleDocumentInput" });
export type UpsertScooterSaleDocumentInput = z.infer<
  typeof upsertScooterSaleDocumentInputSchema
>;

export const createScooterSaleDocumentUploadUrlInputSchema = z
  .object({
    contentType: scooterSaleDocumentContentTypeSchema,
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(SHA_256_HEX_PATTERN),
    imageWidth: z.number().int().positive().nullable().optional(),
    imageHeight: z.number().int().positive().nullable().optional(),
    pageCount: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const isPdf = input.contentType === "application/pdf";
    if (isPdf && !input.pageCount) {
      ctx.addIssue({
        code: "custom",
        path: ["pageCount"],
        message: "PDF uploads require a page count.",
      });
    }
    if (isPdf && (input.imageWidth != null || input.imageHeight != null)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageWidth"],
        message: "PDF uploads cannot use image dimensions.",
      });
    }
    if (!isPdf && (!input.imageWidth || !input.imageHeight)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageWidth"],
        message: "Image uploads require width and height.",
      });
    }
    if (!isPdf && input.pageCount != null) {
      ctx.addIssue({
        code: "custom",
        path: ["pageCount"],
        message: "Image uploads cannot use a page count.",
      });
    }
  })
  .meta({ id: "CreateScooterSaleDocumentUploadUrlInput" });
export type CreateScooterSaleDocumentUploadUrlInput = z.infer<
  typeof createScooterSaleDocumentUploadUrlInputSchema
>;

export const scooterSaleDocumentUploadUrlSchema = z
  .object({
    uploadUrl: z.string().url(),
    uploadToken: z.string().min(1),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime({ offset: true }),
    maxBytes: z.number().int().positive(),
  })
  .strict()
  .meta({ id: "ScooterSaleDocumentUploadUrl" });
export type ScooterSaleDocumentUploadUrl = z.infer<
  typeof scooterSaleDocumentUploadUrlSchema
>;

export const completeScooterSaleDocumentUploadInputSchema = z
  .object({ uploadToken: z.string().min(1) })
  .strict()
  .meta({ id: "CompleteScooterSaleDocumentUploadInput" });
export type CompleteScooterSaleDocumentUploadInput = z.infer<
  typeof completeScooterSaleDocumentUploadInputSchema
>;

export const scooterSaleDocumentAssetSchema = z
  .object({
    assetId: idSchema,
    contentType: scooterSaleDocumentContentTypeSchema,
    byteSize: z.number().int().positive(),
    checksumSha256: z.string().regex(SHA_256_HEX_PATTERN),
    imageWidth: z.number().int().positive().nullable(),
    imageHeight: z.number().int().positive().nullable(),
    pageCount: z.number().int().positive().nullable(),
    contentUrl: z.string(),
  })
  .strict();
export type ScooterSaleDocumentAsset = z.infer<
  typeof scooterSaleDocumentAssetSchema
>;

export const scooterSaleDocumentSchema = z
  .object({
    id: idSchema,
    scooterSaleId: idSchema,
    documentNumber: z.string().nullable(),
    issuedOn: dateSchema.nullable(),
    notes: z.string().nullable(),
    asset: scooterSaleDocumentAssetSchema.nullable(),
    createdByUserId: idSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .meta({ id: "ScooterSaleDocument" });
export type ScooterSaleDocument = z.infer<typeof scooterSaleDocumentSchema>;
