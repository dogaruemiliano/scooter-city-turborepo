import { z } from "zod";

import {
  personDocumentPhotoSlotSchema,
  personDocumentTypeSchema,
  personDriverLicenseCategoryEntrySchema,
  personNationalIdFormatSchema,
} from "./persons.schemas";

export const PERSON_EXTRACTION_PERSON_FIELDS = [
  "firstName",
  "lastName",
  "cnp",
  "dateOfBirth",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
] as const;

export const PERSON_EXTRACTION_DOCUMENT_FIELDS = [
  "series",
  "number",
  "cnp",
  "issuingCountryCode",
  "issuedBy",
  "issuedOn",
  "expiresOn",
] as const;

export const PERSON_DOCUMENT_EXTRACTION_WARNINGS = [
  "unclearText",
  "ambiguousDate",
  "typeMismatch",
  "conflictingSources",
  "invalidValue",
  "noData",
] as const;
export const personDocumentExtractionWarningSchema = z.enum(
  PERSON_DOCUMENT_EXTRACTION_WARNINGS,
);
export type PersonDocumentExtractionWarning = z.infer<
  typeof personDocumentExtractionWarningSchema
>;

export const analyzePersonDocumentInputSchema = z
  .object({
    documentType: personDocumentTypeSchema,
    nationalIdFormat: personNationalIdFormatSchema.optional(),
    photos: z
      .object({
        front: z.string().trim().min(1).max(10_000).optional(),
        back: z.string().trim().min(1).max(10_000).optional(),
        other: z.string().trim().min(1).max(10_000).optional(),
      })
      .strict()
      .refine((photos) => Object.values(photos).some(Boolean), {
        message: "At least one uploaded document is required.",
      }),
  })
  .strict()
  .refine(
    (input) =>
      input.nationalIdFormat === undefined ||
      input.documentType === "nationalId",
    {
      message: "National ID format is only valid for national IDs.",
      path: ["nationalIdFormat"],
    },
  )
  .meta({ id: "AnalyzePersonDocumentInput" });
export type AnalyzePersonDocumentInput = z.infer<
  typeof analyzePersonDocumentInputSchema
>;

const suggestionSourceShape = {
  value: z.string().trim().min(1).max(200),
  sourceSlot: personDocumentPhotoSlotSchema,
  needsReview: z.boolean(),
};
export const personDocumentExtractionSuggestionSchema = z.discriminatedUnion(
  "target",
  [
    z
      .object({
        target: z.literal("person"),
        field: z.enum(PERSON_EXTRACTION_PERSON_FIELDS),
        ...suggestionSourceShape,
      })
      .strict(),
    z
      .object({
        target: z.literal("document"),
        field: z.enum(PERSON_EXTRACTION_DOCUMENT_FIELDS),
        ...suggestionSourceShape,
      })
      .strict(),
  ],
);
export type PersonDocumentExtractionSuggestion = z.infer<
  typeof personDocumentExtractionSuggestionSchema
>;

export const personDocumentExtractionContentSchema = z
  .object({
    detectedDocumentType: personDocumentTypeSchema.nullable(),
    suggestions: z.array(personDocumentExtractionSuggestionSchema).max(64),
    licenseCategories: z
      .array(
        z
          .object({
            value: personDriverLicenseCategoryEntrySchema,
            sourceSlot: personDocumentPhotoSlotSchema,
            needsReview: z.boolean(),
          })
          .strict(),
      )
      .max(24),
    warnings: z.array(personDocumentExtractionWarningSchema).max(20),
  })
  .strict()
  .meta({ id: "PersonDocumentExtractionContent" });
export type PersonDocumentExtractionContent = z.infer<
  typeof personDocumentExtractionContentSchema
>;

export const personDocumentExtractionSchema =
  personDocumentExtractionContentSchema
    .extend({
      documentType: personDocumentTypeSchema,
      sourceUploadIds: z.array(z.string().min(1)).min(1).max(3),
      reviewRequired: z.literal(true),
    })
    .strict()
    .meta({ id: "PersonDocumentExtraction" });
export type PersonDocumentExtraction = z.infer<
  typeof personDocumentExtractionSchema
>;
