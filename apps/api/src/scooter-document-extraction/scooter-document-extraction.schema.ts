import { v1 } from "@repo/api-shared";
import { z } from "zod";

const registrationFields = [
  "registrationType",
  "registrationNumber",
  "registrationDate",
  "registrationCertificateNumber",
  "temporaryRegistrationExpiresAt",
  "registrationCounty",
  "registrationLocality",
  "registrationLocalityCode",
  "registrationHolder",
] as const;
const civMetadata = new Set([
  "civNumber",
  "civVersion",
  "civIssuedAt",
  "civIssuingAuthority",
]);

const foreignFields = [
  "foreignRegistrationNumber",
  "foreignRegistrationCountry",
  "foreignRegistrationCertificateNumber",
  "foreignFirstRegistrationDate",
  "foreignRegistrationDate",
  "foreignRegistrationHolder",
];
const exportFields = [
  "exportCertificateNumber",
  "exportDate",
  "exporterName",
  "exportRecipientName",
];
export function extractionFieldsForType(
  type: v1.scooters.ScooterDocumentType,
): string[] {
  if (type === "insurance") return [...v1.scooters.INSURANCE_FIELDS];
  if (type === "registration_certificate")
    return ["brandName", "requiredLicenseCategory", ...registrationFields];
  if (type === "itp_card") return ["brandName"];
  if (type === "itp_certificate") return ["vin", "brandName"];
  const technical = [
    ...new Set(v1.scooters.SCOOTER_DOCUMENT_EXTRACTABLE_FIELDS),
  ].filter(
    (field) =>
      field !== "propulsionSystem" &&
      !(registrationFields as readonly string[]).includes(field) &&
      !(v1.scooters.INSURANCE_FIELDS as readonly string[]).includes(field) &&
      !foreignFields.includes(field) &&
      !exportFields.includes(field) &&
      (type === "civ" || !civMetadata.has(field)),
  );
  if (type === "foreign_registration") return [...technical, ...foreignFields];
  if (type === "ownership_proof")
    return [...technical, ...foreignFields, ...exportFields];
  if (type === "export_certificate")
    return [...technical, ...foreignFields, ...exportFields];
  if (type === "import_document")
    return [...technical, ...foreignFields, ...exportFields];
  return technical;
}

// No transforms/refinements: this exact shape can be sent to strict structured
// output without generating unrepresentable JSON Schema. Each object is closed
// and all properties are required; unknown readings are explicitly nullable.
const modelFieldsSchema = z
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
  .max(100);
const modelRawFieldsSchema = z
  .array(
    z
      .object({
        key: z.string().min(1).max(120),
        value: z.string().max(2000).nullable(),
      })
      .strict(),
  )
  .max(100);
const modelInspectionSchema = z
  .object({
    inspectionDate: z.string().max(120).nullable(),
    validUntil: z.string().max(120).nullable(),
    result: z.enum(["passed", "failed", "unknown"]).nullable(),
    certificateNumber: z.string().max(120).nullable(),
    odometerKm: z.number().nullable(),
    rawFields: modelRawFieldsSchema,
  })
  .strict();
export const scooterDocumentModelOutputSchema = z
  .object({
    detectedDocumentType: z.enum(v1.scooters.SCOOTER_DOCUMENT_TYPES).nullable(),
    vin: z.string().max(120).nullable(),
    fields: modelFieldsSchema,
    rawFields: modelRawFieldsSchema,
    // Flat logical records avoid recursive provider schemas. Legacy results are
    // upgraded to documents:null before parsing by the service.
    documents: z
      .array(
        z
          .object({
            documentType: z.enum(v1.scooters.SCOOTER_DOCUMENT_TYPES),
            pages: z.array(z.number().int().min(1).max(10)).min(1).max(10),
            regions: z
              .array(
                z
                  .object({
                    page: z.number().int().min(1).max(10),
                    x: z.number().min(0).max(1),
                    y: z.number().min(0).max(1),
                    width: z.number().positive().max(1),
                    height: z.number().positive().max(1),
                  })
                  .strict(),
              )
              .max(40),
            vin: z.string().max(120).nullable(),
            fields: modelFieldsSchema,
            rawFields: modelRawFieldsSchema,
            inspections: z.array(modelInspectionSchema).max(50),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .nullable(),
  })
  .strict();

export const scooterDocumentModelJsonSchema = z.toJSONSchema(
  scooterDocumentModelOutputSchema,
  { target: "draft-07" },
);
