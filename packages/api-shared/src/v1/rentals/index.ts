import { z } from "zod";
import { maintenanceScooterSchema } from "../problems";
import {
  rentalTermsSchema,
  rentalPromotionSchema,
  rentalPaymentMethodSchema,
  rentalInspectionSchema,
  rentalPaymentSchema,
  rentalInspectionDataSchema,
  rentalConclusionContextSchema,
} from "./checkout";
export * from "./checkout";

export const rentalStatusSchema = z.enum([
  "reserved",
  "active",
  "returned",
  "cancelled",
]);
export const rentalSchema = z.object({
  id: z.string(),
  personId: z.string(),
  scooterId: z.string(),
  scooter: maintenanceScooterSchema,
  person: z.object({
    id: z.string(),
    avatarAssetId: z.string().nullable().optional(),
    firstName: z.string(),
    lastName: z.string(),
  }),
  startsAt: z.string(),
  endsAt: z.string(),
  status: rentalStatusSchema,
  customerNotes: z.string().nullable(),
  internalNotes: z.string().nullable(),
  revision: z.number().int(),
  handedOverAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  createdAt: z.string(),
  workflowVersion: z.number().int().optional(),
  conclusionContext: rentalConclusionContextSchema.nullable().optional(),
  terms: rentalTermsSchema.nullable().optional(),
  agreementStartsAt: z.string().nullable().optional(),
  agreementEndsAt: z.string().nullable().optional(),
  billingAnchorAt: z.string().nullable().optional(),
  nextPaymentDueAt: z.string().nullable().optional(),
  contractTimezone: z.string().optional(),
});
export const customerRentalSchema = rentalSchema.omit({
  personId: true,
  person: true,
  internalNotes: true,
});
export const rentalCheckoutSchema = z.object({
  rental: rentalSchema,
  inspection: rentalInspectionSchema.nullable(),
  prefill: rentalInspectionDataSchema,
  expectedScooterUpdatedAt: z.iso.datetime(),
  payments: z.array(rentalPaymentSchema),
  issues: z.array(z.string()),
  handoverRecipients: z.array(
    z.object({
      personId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
    }),
  ),
  lastKnownMileageKm: z.number().int().nonnegative().nullable(),
});
export const rentalListSchema = z.object({
  items: z.array(rentalSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const customerRentalListSchema = rentalListSchema.extend({
  items: z.array(customerRentalSchema),
});
export const listRentalsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    status: rentalStatusSchema.optional(),
  })
  .strict();
export const createRentalInputSchema = z
  .object({
    personId: z.string().min(1),
    scooterId: z.string().min(1),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    customerNotes: z.string().trim().max(4000).optional(),
    internalNotes: z.string().trim().max(4000).optional(),
    promotion: rentalPromotionSchema.optional(),
    conclusionContext: rentalConclusionContextSchema.optional(),
    rentalPaymentMethod: rentalPaymentMethodSchema.optional(),
    depositPaymentMethod: rentalPaymentMethodSchema.optional(),
    agreementStartsAt: z.iso.datetime().optional(),
    driverPersonIds: z.array(z.string().min(1)).min(1).max(10).optional(),
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: "End must be after start",
    path: ["endsAt"],
  });
export const rentalTransitionInputSchema = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const rentalHandoverInputSchema = rentalTransitionInputSchema.extend({
  recipientPersonId: z.string().min(1),
  originalIdentityChecked: z.literal(true),
});
export const customerProfileSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});
export const customerDocumentSchema = z.object({
  id: z.string(),
  type: z.enum(["registration_certificate", "insurance"]),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number().int(),
  createdAt: z.string(),
});
export const customerDocumentListSchema = z.object({
  items: z.array(customerDocumentSchema),
});
export const documentVisibilityInputSchema = z
  .object({ customerVisible: z.boolean() })
  .strict();
export type Rental = z.infer<typeof rentalSchema>;
export type CustomerRental = z.infer<typeof customerRentalSchema>;
export type CreateRentalInput = z.infer<typeof createRentalInputSchema>;
export type ListRentalsQuery = z.infer<typeof listRentalsQuerySchema>;
export * from "./media";
