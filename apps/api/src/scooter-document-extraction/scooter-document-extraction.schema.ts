import { v1 } from "@repo/api-shared";
import { z } from "zod";

const registrationFields = [
  "registrationType",
  "registrationNumber",
  "registrationDate",
  "registrationCertificateNumber",
  "temporaryRegistrationExpiresAt",
] as const;
const civMetadata = new Set([
  "civNumber",
  "civVersion",
  "civIssuedAt",
  "civIssuingAuthority",
]);

export function extractionFieldsForType(
  type: v1.scooters.ScooterDocumentType,
): string[] {
  if (type === "insurance") return [...v1.scooters.INSURANCE_FIELDS];
  if (type === "registration_certificate")
    return [
      "vin",
      "brandName",
      "requiredLicenseCategory",
      ...registrationFields,
    ];
  return [...new Set(v1.scooters.SCOOTER_DOCUMENT_EXTRACTABLE_FIELDS)].filter(
    (field) =>
      field !== "propulsionSystem" &&
      !(registrationFields as readonly string[]).includes(field) &&
      !(v1.scooters.INSURANCE_FIELDS as readonly string[]).includes(field) &&
      (type === "civ" || !civMetadata.has(field)),
  );
}

// No transforms/refinements: this exact shape can be sent to strict structured
// output without generating unrepresentable JSON Schema. Each object is closed
// and all properties are required; unknown readings are explicitly nullable.
export const scooterDocumentModelOutputSchema = z
  .object({
    detectedDocumentType: z.enum(v1.scooters.SCOOTER_DOCUMENT_TYPES).nullable(),
    vin: z.string().max(120).nullable(),
    fields: z
      .array(
        z
          .object({
            field: z.enum(v1.scooters.SCOOTER_DOCUMENT_EXTRACTABLE_FIELDS),
            value: z.union([z.string().max(2000), z.number(), z.null()]),
            rawValue: z.string().max(2000).nullable(),
            needsReview: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    rawFields: z
      .array(
        z
          .object({
            key: z.string().min(1).max(120),
            value: z.string().max(2000).nullable(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const scooterDocumentModelJsonSchema = z.toJSONSchema(
  scooterDocumentModelOutputSchema,
  { target: "draft-07" },
);
