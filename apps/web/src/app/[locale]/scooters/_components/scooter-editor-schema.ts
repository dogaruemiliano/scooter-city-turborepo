import { v1 } from "@repo/api-shared";
import { z } from "zod";

/** Order also defines the visible field order within each section. */
export const SCOOTER_EDITOR_SECTIONS = [
  {
    title: "identity",
    fields: [
      "vin",
      "brandId",
      "vehicleType",
      "variant",
      "version",
      "commercialName",
      "model",
      "manufactureYear",
      "color",
    ],
  },
  {
    title: "classification",
    fields: [
      "vehicleClass",
      "standingCapacity",
      "vehicleCategory",
      "nationalCategory",
      "bodyType",
      "typeApprovalNumber",
      "nationalRegistryNumber",
      "seatsCount",
    ],
  },
  {
    title: "powertrain",
    fields: [
      "powertrainType",
      "engineCode",
      "engineDisplacementCc",
      "powerKw",
      "fuelType",
      "ratedEngineRpm",
      "engineSerialNumber",
      "electricMotorPowerKw",
      "powerToWeightRatioKwKg",
      "maxSpeedKmh",
      "emissionsStandard",
      "nationalEmissionsCode",
      "fuelTankCapacityLiters",
    ],
  },
  {
    title: "masses",
    fields: [
      "curbWeightKg",
      "actualWeightKg",
      "maxTechnicallyPermissibleMassKg",
      "maxTrainMassKg",
      "maxAxle1MassKg",
      "maxAxle2MassKg",
      "maxAxle3MassKg",
      "maxAxle4MassKg",
      "maxAxle5MassKg",
      "brakedTrailerMassKg",
      "unbrakedTrailerMassKg",
      "couplingPointMassKg",
    ],
  },
  {
    title: "dimensions",
    fields: ["axlesCount", "lengthMm", "widthMm", "heightMm", "wheelbaseMm"],
  },
  {
    title: "wheels",
    fields: [
      "frontTyreSpecification",
      "rearTyreSpecification",
      "driveType",
      "frontSuspension",
      "rearSuspension",
    ],
  },
  {
    title: "noiseEmissions",
    fields: [
      "stationaryNoiseDb",
      "noiseMeasurementRpm",
      "drivingNoiseDb",
      "co2EmissionsGKm",
    ],
  },
  { title: "civMentions", fields: ["civMentions"] },
  { title: "operational", fields: ["currentMileageKm", "notes"] },
] as const;

export const REGISTRATION_FIELDS = [
  "registrationType",
  "registrationNumber",
  "registrationDate",
  "temporaryRegistrationExpiresAt",
  "requiredLicenseCategory",
] as const;
export const EDITOR_FIELDS = [
  "civNumber",
  "civVersion",
  "civIssuedAt",
  "civIssuingAuthority",
  ...SCOOTER_EDITOR_SECTIONS.flatMap((section) => [...section.fields]),
  "registrationCertificateNumber",
  "vehicleCategoryOther",
  "nationalCategoryOther",
  "bodyTypeOther",
  "fuelTypeOther",
] as const;
export const CREATE_FIELDS = [
  ...EDITOR_FIELDS,
  ...REGISTRATION_FIELDS,
] as const;
export type ScooterEditorField = (typeof CREATE_FIELDS)[number];
export type ScooterEditorValues = Record<ScooterEditorField, string>;

export const DECIMAL_FIELDS = new Set<string>([
  "stationaryNoiseDb",
  "drivingNoiseDb",
  "co2EmissionsGKm",
  "powerKw",
  "electricMotorPowerKw",
  "powerToWeightRatioKwKg",
  "fuelTankCapacityLiters",
]);
export const INTEGER_FIELDS = new Set<string>([
  "maxAxle3MassKg",
  "maxAxle4MassKg",
  "maxAxle5MassKg",
  "brakedTrailerMassKg",
  "unbrakedTrailerMassKg",
  "couplingPointMassKg",
  "standingCapacity",
  "noiseMeasurementRpm",
  "manufactureYear",
  "seatsCount",
  "engineDisplacementCc",
  "ratedEngineRpm",
  "maxSpeedKmh",
  "curbWeightKg",
  "actualWeightKg",
  "maxTechnicallyPermissibleMassKg",
  "maxTrainMassKg",
  "maxAxle1MassKg",
  "maxAxle2MassKg",
  "axlesCount",
  "lengthMm",
  "widthMm",
  "heightMm",
  "wheelbaseMm",
  "currentMileageKm",
]);
export const isNumericField = (field: string) =>
  INTEGER_FIELDS.has(field) || DECIMAL_FIELDS.has(field);

export function scooterEditorDefaults(
  scooter?: v1.scooters.Scooter,
): ScooterEditorValues {
  const values = Object.fromEntries(
    CREATE_FIELDS.map((field) => [
      field,
      scooter?.[field] == null ? "" : String(scooter[field]),
    ]),
  ) as ScooterEditorValues;
  values.civVersion = scooter?.civVersion ?? "unknown";
  values.powertrainType = scooter?.powertrainType ?? "";
  values.registrationType = scooter?.registrationType ?? "unregistered";
  values.requiredLicenseCategory = scooter?.requiredLicenseCategory ?? "none";
  return values;
}

function convertValues(values: Partial<ScooterEditorValues>) {
  const inactive = v1.scooters.inactivePowertrainFields(
    values.powertrainType ?? "",
  );
  return Object.fromEntries(
    Object.entries(values).map(([field, value = ""]) => [
      field,
      (inactive as readonly string[]).includes(field)
        ? null
        : field === "fuelType" && values.powertrainType === "electric"
          ? "electric"
          : field === "fuelTypeOther" && values.powertrainType === "electric"
            ? null
            : field.endsWith("Other") &&
                values[field.slice(0, -5) as ScooterEditorField] !== "other"
              ? null
              : isNumericField(field)
                ? v1.vehicleCiv.parseCivNumber(value)
                : [
                      "civVersion",
                      "vin",
                      "brandId",
                      "powertrainType",
                      "registrationType",
                    ].includes(field)
                  ? value.trim()
                  : field === "requiredLicenseCategory"
                    ? value || undefined
                    : value.trim() || null,
    ]),
  );
}

const rawShape = Object.fromEntries(
  CREATE_FIELDS.map((field) => [field, z.string()]),
) as Record<ScooterEditorField, z.ZodString>;
const rawCreateSchema = z.object(rawShape);

export const scooterCreateFormSchema = rawCreateSchema
  .transform(
    (values) =>
      convertValues(values) as unknown as z.input<
        typeof v1.scooters.createScooterInputSchema
      >,
  )
  .pipe(v1.scooters.createScooterInputSchema)
  .transform((input) => {
    const plate = v1.scooters.validatePlateForRegistrationType(
      input.registrationType ?? "unregistered",
      input.registrationNumber,
    );
    return { ...input, registrationNumber: plate?.displayValue || null };
  });

// Registration lifecycle values never enter the edit resolver or PATCH.
export const scooterEditFormSchema = rawCreateSchema
  .omit({
    registrationType: true,
    registrationNumber: true,
    registrationDate: true,
    temporaryRegistrationExpiresAt: true,
    requiredLicenseCategory: true,
  })
  .transform(
    (values) =>
      convertValues(values) as unknown as z.input<
        typeof v1.scooters.updateScooterInputSchema
      >,
  )
  .pipe(v1.scooters.updateScooterInputSchema);

export function scooterChangedFields(
  input: v1.scooters.UpdateScooterInput,
  dirty: Partial<Record<ScooterEditorField, boolean>>,
): v1.scooters.UpdateScooterInput {
  const inactive = v1.scooters.inactivePowertrainFields(
    input.powertrainType ?? "",
  );
  const changes = Object.fromEntries(
    EDITOR_FIELDS.filter(
      (field) =>
        dirty[field] && !(inactive as readonly string[]).includes(field),
    ).map((field) => [field, input[field]]),
  );
  if (dirty.powertrainType) {
    for (const field of inactive) changes[field] = null;
    if (input.powertrainType === "electric") {
      changes.fuelType = "electric";
      changes.fuelTypeOther = null;
    }
  }
  for (const field of v1.scooters.SCOOTER_CIV_FIELDS) {
    const other = `${field}Other` as const;
    if (dirty[field] || dirty[other]) {
      changes[field] = input[field];
      changes[other] = input[other];
    }
  }
  return v1.scooters.updateScooterInputSchema.parse(changes);
}
