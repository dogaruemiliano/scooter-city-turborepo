import { z } from "zod";
import { scooterDocumentExtractedDataSchema } from "./scooter-document-extraction.schemas";

export const SCOOTER_DOCUMENT_TYPES = [
  "import_document",
  "civ",
  "registration_certificate",
  "insurance",
] as const;
export const SCOOTER_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const SCOOTER_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const SCOOTER_DOCUMENT_MAX_FILES = 20;
export const scooterDocumentTypeSchema = z.enum(SCOOTER_DOCUMENT_TYPES);
/** Unclassified is a staging state only; saved documents always have a concrete type. */
export const scooterDocumentUploadTypeSchema = z.enum([
  ...SCOOTER_DOCUMENT_TYPES,
  "unclassified",
]);
export type ScooterDocumentUploadType = z.infer<
  typeof scooterDocumentUploadTypeSchema
>;
export type ScooterDocumentType = z.infer<typeof scooterDocumentTypeSchema>;
const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  // Reject control characters and path separators in display filenames.
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\x00-\x1f\x7f/\\]+$/);
export const scooterDocumentDraftSchema = z
  .object({
    insurancePolicyId: z.string().min(1).max(120).optional(),
    extractedData: scooterDocumentExtractedDataSchema.nullable().optional(),
    type: scooterDocumentTypeSchema,
    fileName: fileNameSchema,
    uploadToken: z.string().min(1).max(8192),
    uploadType: z.literal("unclassified").optional(),
  })
  .strict();
export type ScooterDocumentDraft = z.infer<typeof scooterDocumentDraftSchema>;
export const scooterDocumentDraftsSchema = z
  .array(scooterDocumentDraftSchema)
  .max(SCOOTER_DOCUMENT_MAX_FILES);
export const createScooterDocumentUploadSchema = z
  .object({
    sessionId: z.string().min(1).max(120).optional(),
    type: scooterDocumentUploadTypeSchema,
    contentType: z.enum(SCOOTER_DOCUMENT_CONTENT_TYPES),
    byteSize: z.number().int().positive().max(SCOOTER_DOCUMENT_MAX_BYTES),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .meta({ id: "CreateScooterDocumentUpload" });
export type CreateScooterDocumentUpload = z.infer<
  typeof createScooterDocumentUploadSchema
>;
export const scooterDocumentUploadSchema = z
  .object({
    uploadUrl: z.url(),
    uploadToken: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.string(),
    maxBytes: z.number(),
  })
  .meta({ id: "ScooterDocumentUpload" });
export const scooterDocumentSchema = z
  .object({
    id: z.string(),
    insurancePolicyId: z.string().nullable().optional(),
    extractedData: scooterDocumentExtractedDataSchema.nullable().optional(),
    type: scooterDocumentTypeSchema,
    fileName: z.string(),
    contentType: z.enum(SCOOTER_DOCUMENT_CONTENT_TYPES),
    byteSize: z.number(),
    createdAt: z.string(),
    contentUrl: z.string(),
  })
  .meta({ id: "ScooterDocument" });
export const scooterDocumentListSchema = z
  .array(scooterDocumentSchema)
  .meta({ id: "ScooterDocumentList" });
export type ScooterDocument = z.infer<typeof scooterDocumentSchema>;
