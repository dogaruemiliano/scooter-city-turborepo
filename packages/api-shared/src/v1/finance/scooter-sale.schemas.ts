import { z } from "zod";

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
    amount: positiveMoneyAmountSchema,
    paidOn: dateSchema,
    paymentMethod: paymentMethodSchema,
    companyWalletId: idSchema,
    idempotencyKey: z.string().trim().min(1).max(MAX_IDEMPOTENCY_KEY_LENGTH),
    notes: optionalText(),
  })
  .strict()
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
