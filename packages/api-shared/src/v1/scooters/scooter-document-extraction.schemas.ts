import { z } from "zod";
import { CIV_FIELD_MAPPING } from "../vehicle-civ/civ-field-mapping";
import { SCOOTER_DOCUMENT_TYPES } from "./scooter-document-types";
import { INSURANCE_FIELDS } from "./scooter-insurance.schemas";

/** Only data printed on vehicle documents belongs in an extraction. */
export const SCOOTER_DOCUMENT_EXTRACTABLE_FIELDS = [
  ...Object.keys(CIV_FIELD_MAPPING).filter((field) => field !== "brandId"),
  "brandName",
  "model",
  "civNumber",
  "civVersion",
  "civIssuedAt",
  "civIssuingAuthority",
  "powertrainType",
  "vehicleCategoryOther",
  "nationalCategoryOther",
  "bodyTypeOther",
  "fuelTypeOther",
  "registrationType",
  "registrationNumber",
  "registrationDate",
  "registrationCertificateNumber",
  "temporaryRegistrationExpiresAt",
  "requiredLicenseCategory",
  "registrationCounty",
  "registrationLocality",
  "registrationLocalityCode",
  "registrationHolder",
  "foreignRegistrationNumber",
  "foreignRegistrationCountry",
  "foreignRegistrationCertificateNumber",
  "foreignFirstRegistrationDate",
  "foreignRegistrationDate",
  "foreignRegistrationHolder",
  "exportCertificateNumber",
  "exportDate",
  "exporterName",
  "exportRecipientName",
  ...INSURANCE_FIELDS,
] as const;

const extractableFields = new Set<string>(SCOOTER_DOCUMENT_EXTRACTABLE_FIELDS);
const boundedKey = z.string().min(1).max(120);
const rawFields = z
  .record(boundedKey, z.string().max(2000).nullable())
  .refine((value) => Object.keys(value).length <= 100, {
    message: "At most 100 original document fields are allowed.",
  });
const fields = z
  .record(
    boundedKey.refine((key) => extractableFields.has(key), {
      message: "This field cannot be extracted from a vehicle document.",
    }),
    z.union([z.string().max(2000), z.number().finite(), z.null()]),
  )
  .refine((value) => Object.keys(value).length <= 100, {
    message: "At most 100 document fields are allowed.",
  });

const documentVin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/);

/** One row on an ITP card or one inspection certificate. Never inferred from CIV dates. */
export const scooterDocumentInspectionSchema = z
  .object({
    inspectionDate: z.iso.date().nullable(),
    validUntil: z.iso.date().nullable(),
    result: z.enum(["passed", "failed", "unknown"]).nullable(),
    certificateNumber: z.string().min(1).max(120).nullable(),
    odometerKm: z.number().int().nonnegative().max(2_147_483_647).nullable(),
    rawFields,
  })
  .strict();
export type ScooterDocumentInspection = z.infer<
  typeof scooterDocumentInspectionSchema
>;

export const logicalDocumentExtractionSchema = z
  .object({
    id: z.string().min(1).max(120),
    documentType: z.enum(SCOOTER_DOCUMENT_TYPES),
    // One-based page numbers in the original upload, including blank reverse sides.
    pages: z.array(z.number().int().min(1).max(10)).min(1).max(10),
    regions: z
      .array(
        z
          .object({
            page: z.number().int().min(1).max(10),
            // Coordinates are normalized to the original visible page, from top-left.
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            width: z.number().positive().max(1),
            height: z.number().positive().max(1),
          })
          .strict(),
      )
      .max(40)
      .optional(),
    vin: documentVin.nullable(),
    vinReview: z
      .object({
        method: z.literal("manual"),
        originalVin: documentVin.nullable(),
      })
      .strict()
      .optional(),
    fields,
    rawFields,
    issues: z
      .array(
        z
          .object({
            field: z.string().min(1).max(120),
            code: z.enum([
              "unreadable",
              "invalidValue",
              "conflictingValues",
              "typeMismatch",
              "noData",
            ]),
          })
          .strict(),
      )
      .max(500)
      .optional(),
    inspections: z.array(scooterDocumentInspectionSchema).max(50).optional(),
  })
  .strict();
export type LogicalDocumentExtraction = z.infer<
  typeof logicalDocumentExtractionSchema
>;

/** Per-file source evidence, independent of the current normalized scooter data. */
export const scooterDocumentExtractedDataSchema = z
  .object({
    vin: documentVin.nullable(),
    fields,
    rawFields,
    documents: z.array(logicalDocumentExtractionSchema).max(20).optional(),
    // Human selection only: null keeps this upload as historical policy evidence.
    currentInsuranceDocumentId: z
      .string()
      .min(1)
      .max(120)
      .nullable()
      .optional(),
    // A manual correction never replaces the original AI reading or raw text.
    vinReview: z
      .object({
        method: z.literal("manual"),
        originalVin: documentVin.nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.currentInsuranceDocumentId &&
      !evidence.documents?.some(
        (document) =>
          document.id === evidence.currentInsuranceDocumentId &&
          document.documentType === "insurance",
      )
    )
      context.addIssue({
        code: "custom",
        path: ["currentInsuranceDocumentId"],
        message: "Choose an insurance document from this upload.",
      });
  });
export type ScooterDocumentExtractedData = z.infer<
  typeof scooterDocumentExtractedDataSchema
>;

export const scooterDocumentExtractionUpdateSchema = z
  .object({
    documentId: z.string().min(1).max(120),
    extractedData: scooterDocumentExtractedDataSchema.nullable(),
  })
  .strict();
export type ScooterDocumentExtractionUpdate = z.infer<
  typeof scooterDocumentExtractionUpdateSchema
>;
