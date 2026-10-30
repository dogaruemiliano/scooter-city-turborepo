import { z } from "zod";
export * from "./retention";

export const templateTypes = [
  "RENTAL_AGREEMENT",
  "GDPR_NOTICE",
  "TECHNICAL_HANDOVER",
  "PROMOTION_ADDENDUM",
] as const;
export const contractLogoUploadSchema = z.strictObject({
  assetId: z.string().min(1),
});
export const templateTypeSchema = z.enum(templateTypes);
export type ContractTemplateType = z.infer<typeof templateTypeSchema>;
export const signingCookie = "scooter_signing";
export const documentOrder = [
  "RENTAL_AGREEMENT",
  "GDPR_NOTICE",
  "TECHNICAL_HANDOVER",
] as const;
const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const idempotentInputSchema = z.strictObject({ idempotencyKey: id });
export const createTemplateInputSchema = z.strictObject({
  type: templateTypeSchema,
  name: z.string().trim().min(1).max(200),
  locale: z.enum(["ro", "en"]).default("ro"),
});
export const approveTemplateInputSchema = z.strictObject({
  manifestHash: hash,
  reviewStatement: z.string().trim().min(20).max(4000),
});
export const createTemplateSetInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  locale: z.enum(["ro", "en"]).default("ro"),
  agreementVersionId: id,
  gdprVersionId: id,
  technicalVersionId: id,
  promotionVersionId: id.optional(),
  promotionApproved: z.boolean().default(false),
});
export const activateTemplateSetInputSchema = z.strictObject({
  idempotencyKey: id,
  expectedActiveSetId: id.nullable(),
  reason: z.string().trim().min(5).max(1000),
});
export const contractSettingsInputSchema = z.strictObject({
  brandName: z.string().trim().min(1).max(200),
  gpsHistoryStatement: z.string().trim().min(10).max(2000),
  logoAssetId: id.nullable().optional(),
  registryNumber: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(1000),
  city: z.string().trim().min(1).max(200),
  county: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(40),
  email: z.email(),
  iban: z.string().trim().min(10).max(100),
  bank: z.string().trim().min(1).max(200),
  representativeUserId: id,
  representativeCapacity: z.string().trim().min(1).max(200),
  selfieNotice: z.string().trim().min(40).max(20000),
  selfieNoticeVersion: id,
  signingAcceptanceText: z.string().trim().min(20).max(2000),
  privacyRetentionDays: z.number().int().positive().max(3650),
  contractRetentionDays: z.number().int().positive().max(36500),
  legalReviewStatement: z.string().trim().min(20).max(4000),
});
export const createPackageInputSchema = idempotentInputSchema.extend({
  updateToActiveSet: z.boolean().default(false),
});
export const inviteInputSchema = idempotentInputSchema.extend({
  channel: z.enum(["sms", "email"]),
});
export const identityReviewInputSchema = z.strictObject({
  approved: z.boolean(),
  reason: z.string().trim().min(5).max(2000),
  selfieAssetId: id,
  identityDocumentId: id,
});
const png = z.string().startsWith("data:image/png;base64,").max(2_800_000);
export const companySignInputSchema = z.strictObject({
  documentId: id,
  contentHash: hash,
  signaturePng: png,
  acceptance: z.literal(true),
});
export const documentSignInputSchema = z.strictObject({
  contentHash: hash,
  signaturePng: png,
  acceptance: z.literal(true),
});
export const exchangeInvitationInputSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const requestSigningOtpInputSchema = z.strictObject({
  purpose: z.enum(["phone", "final"]).default("phone"),
});
export const verifySigningOtpInputSchema = z.strictObject({
  purpose: z.enum(["phone", "final"]).default("phone"),
  code: z.string().regex(/^\d{6}$/),
});
export const completeSigningInputSchema = z.strictObject({
  manifestHash: hash,
  acceptance: z.literal(true),
});
export const signingTelemetryInputSchema = z.strictObject({
  documentId: id,
  event: z.enum(["document_opened", "document_end_reached", "error_reported"]),
  message: z.string().trim().max(2000).optional(),
});
export const retryDeliveryInputSchema = z.strictObject({
  confirmedNotSent: z.boolean().default(false),
  reason: z.string().trim().min(5).max(1000),
});

export const templateVersionSchema = z.object({
  id,
  templateId: id,
  version: z.number().int(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  validationStatus: z.enum(["PENDING", "RUNNING", "PASSED", "FAILED"]),
  sourceSha256: hash,
  manifestHash: hash.nullable(),
  validation: z.unknown().nullable(),
  approvedBy: id.nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export const contractTemplateSchema = z.object({
  id,
  type: templateTypeSchema,
  name: z.string(),
  locale: z.string(),
  versions: z.array(templateVersionSchema),
});
export const templateSetSchema = z.object({
  id,
  name: z.string(),
  version: z.number().int(),
  locale: z.string(),
  agreementVersionId: id,
  gdprVersionId: id,
  technicalVersionId: id,
  promotionVersionId: id.nullable(),
  promotionApproved: z.boolean(),
  manifestHash: hash,
  createdAt: z.string(),
});
export const templateListSchema = z.object({
  items: z.array(contractTemplateSchema),
  sets: z.array(templateSetSchema),
  activeSetId: id.nullable(),
});
export type TemplateList = z.infer<typeof templateListSchema>;
export const rentalDocumentSchema = z.object({
  id,
  type: templateTypeSchema,
  templateVersionId: id,
  contentHash: hash,
  signedHash: hash.nullable(),
  status: z.enum(["published", "signed"]),
  signedAt: z.string().nullable(),
  requiresLimiterSignature: z.boolean(),
  acceptanceText: z.string().optional(),
  limiterAcceptanceText: z.string().nullable().optional(),
  limiterSignedAt: z.string().nullable().optional(),
  companySignedAt: z.string().nullable().optional(),
});
export const documentPackageSchema = z.object({
  id,
  rentalId: id,
  revision: z.number().int(),
  status: z.string(),
  templateSetVersionId: id,
  manifestHash: hash.nullable(),
  documents: z.array(rentalDocumentSchema),
  identityStatus: z.string(),
  selfieAssetId: id.nullable(),
  identityDocumentId: id.nullable(),
  identityPhotos: z
    .array(
      z.object({
        photoId: id,
        assetId: id,
        sha256: hash,
        slot: z.string(),
        contentType: z.string().optional(),
      }),
    )
    .optional(),
  phoneVerifiedAt: z.string().nullable(),
  identityApprovedAt: z.string().nullable(),
  customerCompletedAt: z.string().nullable(),
  companyAcceptedAt: z.string().nullable(),
  contractConcludedAt: z.string().nullable(),
  createdAt: z.string(),
  error: z.string().nullable(),
});
export type DocumentPackage = z.infer<typeof documentPackageSchema>;
export const packageListSchema = z.object({
  items: z.array(documentPackageSchema),
});
export const signingSupportingFileSchema = z.object({
  assetId: id,
  category: z.enum(["vehicle_document", "handover_media"]),
  fileName: z.string(),
  contentType: z.string(),
  sha256: hash,
});
export const signingStateSchema = z.object({
  packageId: id,
  manifestHash: hash,
  phoneMasked: z.string(),
  phoneVerified: z.boolean(),
  identityStatus: z.string(),
  selfieNotice: z.string(),
  selfieNoticeVersion: z.string(),
  finalOtpRequired: z.boolean(),
  finalOtpVerified: z.boolean(),
  signingAcceptanceText: z.string(),
  customerCompletedAt: z.string().nullable(),
  supportingFiles: z.array(signingSupportingFileSchema).default([]),
  documents: z.array(rentalDocumentSchema),
});
export type SigningState = z.infer<typeof signingStateSchema>;
export type ContractSettings = z.infer<typeof contractSettingsInputSchema>;
