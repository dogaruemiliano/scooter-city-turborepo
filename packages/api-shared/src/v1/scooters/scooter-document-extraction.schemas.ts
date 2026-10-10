import { z } from "zod";
import { CIV_FIELD_MAPPING } from "../vehicle-civ/civ-field-mapping";
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

/** Per-file source evidence, independent of the current normalized scooter data. */
export const scooterDocumentExtractedDataSchema = z
  .object({
    vin: documentVin.nullable(),
    fields,
    rawFields,
    // A manual correction never replaces the original AI reading or raw text.
    vinReview: z
      .object({
        method: z.literal("manual"),
        originalVin: documentVin.nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();
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
