import { v1 } from "@repo/api-shared";
import { z } from "zod";

// Keep this wire schema free from transformations/refinements so the same shape
// is usable for OpenAI strict JSON output and our local trust boundary. Invalid
// dates/CNPs/categories are removed individually by the normalization service.
const sourceShape = {
  sourceSlot: z.enum(v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS),
  needsReview: z.boolean(),
};

export const personDocumentModelOutputSchema = z
  .object({
    detectedDocumentType: z.enum(v1.persons.PERSON_DOCUMENT_TYPES).nullable(),
    suggestions: z
      .array(
        z.union([
          z
            .object({
              target: z.literal("person"),
              field: z.enum(v1.persons.PERSON_EXTRACTION_PERSON_FIELDS),
              value: z.string().max(200),
              addressEvidence: z
                .object({
                  section: z.enum([
                    "domicile",
                    "residence",
                    "birthplace",
                    "issuer",
                    "unknown",
                  ]),
                  label: z.string().max(200),
                })
                .strict()
                .nullable(),
              ...sourceShape,
            })
            .strict(),
          z
            .object({
              target: z.literal("document"),
              field: z.enum(v1.persons.PERSON_EXTRACTION_DOCUMENT_FIELDS),
              value: z.string().max(200),
              ...sourceShape,
            })
            .strict(),
        ]),
      )
      .max(64),
    licenseCategories: z
      .array(
        z
          .object({
            value: z
              .object({
                category: z.string().max(20),
                issuedOn: z.string().max(20).nullable(),
                expiresOn: z.string().max(20).nullable(),
                restrictions: z.string().max(200).nullable(),
              })
              .strict(),
            ...sourceShape,
          })
          .strict(),
      )
      .max(24),
    warnings: z
      .array(z.enum(v1.persons.PERSON_DOCUMENT_EXTRACTION_WARNINGS))
      .max(20),
  })
  .strict();

export const personDocumentModelJsonSchema = z.toJSONSchema(
  personDocumentModelOutputSchema,
  { target: "draft-07" },
);
