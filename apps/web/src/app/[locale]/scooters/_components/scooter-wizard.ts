import type { v1 } from "@repo/api-shared";
import {
  SCOOTER_EDITOR_SECTIONS,
  REGISTRATION_FIELDS,
  type ScooterEditorField,
} from "./scooter-editor-schema";

export type ScooterWizardStep =
  | "documents"
  | "import_document"
  | "civ"
  | "registration_certificate"
  | "insurance"
  | "operational";

export const CIV_METADATA_FIELDS = [
  "civAvailability",
  "civNumber",
  "civVersion",
  "civIssuedAt",
  "civIssuingAuthority",
] as const satisfies readonly ScooterEditorField[];

export const OPERATIONAL_FIELDS = [
  "hasGps",
  "hasPhoneStand",
  "hasChargingOutlet",
  "speedometerWorking",
  "odometerWorking",
  "currentMileageKm",
  "actualMaxSpeedKmh",
  "notes",
] as const satisfies readonly ScooterEditorField[];

export const TECHNICAL_FIELDS: readonly ScooterEditorField[] = [
  ...SCOOTER_EDITOR_SECTIONS.filter(
    (section) => section.title !== "operational",
  ).flatMap((section) => [...section.fields]),
  "vehicleCategoryOther",
  "nationalCategoryOther",
  "bodyTypeOther",
  "fuelTypeOther",
];

/** A missing document never creates an empty review step. CIV takes priority. */
export function scooterWizardSteps(
  types: Iterable<v1.scooters.ScooterDocumentType>,
): ScooterWizardStep[] {
  const present = new Set(types);
  return [
    "documents",
    ...(present.has("civ")
      ? ["civ" as const]
      : present.has("import_document")
        ? ["import_document" as const]
        : []),
    ...(present.has("registration_certificate")
      ? ["registration_certificate" as const]
      : []),
    ...(present.has("insurance") ? ["insurance" as const] : []),
    "operational",
  ];
}

export function stepFields(
  step: ScooterWizardStep,
): Array<ScooterEditorField | "insurancePolicies"> {
  switch (step) {
    case "documents":
      return [];
    case "import_document":
      return [...TECHNICAL_FIELDS];
    case "civ":
      return [...CIV_METADATA_FIELDS, ...TECHNICAL_FIELDS];
    case "registration_certificate":
      return ["registrationCertificateNumber", ...REGISTRATION_FIELDS];
    case "insurance":
      return ["insurancePolicies"];
    case "operational":
      return [...OPERATIONAL_FIELDS];
  }
}
