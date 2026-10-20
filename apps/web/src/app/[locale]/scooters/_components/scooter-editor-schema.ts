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
  {
    title: "operational",
    fields: [
      "hasGps",
      "currentMileageKm",
      "odometerWorking",
      "speedometerWorking",
      "actualMaxSpeedKmh",
      "notes",
    ],
  },
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
export type InsuranceEditorValues = Record<
  (typeof v1.scooters.INSURANCE_FIELDS)[number] | "id",
  string
> & {
  vinReviewConfirmed: boolean;
  sourceFileNames?: string[];
  rawFields?: v1.scooters.InsurancePolicyInput["rawFields"];
};
export type ScooterEditorValues = Record<ScooterEditorField, string> & {
  insurancePolicies?: InsuranceEditorValues[];
  fleetNumber?: string | null;
};

export function insuranceEditorDefaults(
  policy?: v1.scooters.InsurancePolicyInput,
): InsuranceEditorValues {
  return {
    id: policy?.id ?? crypto.randomUUID(),
    insuredName: policy?.insuredName ?? "",
    validFrom: policy?.validFrom ?? "",
    validUntil: policy?.validUntil ?? "",
    premiumAmount:
      policy?.premiumAmount == null ? "" : String(policy.premiumAmount),
    currency: policy?.currency || "RON",
    documentVin: policy?.documentVin ?? "",
    vinReviewConfirmed: policy?.vinReviewConfirmed ?? false,
    rawFields: policy?.rawFields,
  };
}
const insuranceEditorSchema = z.object({
  id: z.string(),
  insuredName: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  premiumAmount: z.string(),
  currency: z.string(),
  documentVin: z.string(),
  vinReviewConfirmed: z.boolean(),
  sourceFileNames: z.array(z.string()).optional(),
  rawFields: v1.scooters.insuranceRawFieldsSchema.optional(),
});

/** The visible, untouched create-form placeholder is not an insurance policy. */
export function insuranceEditorHasContent(policy: InsuranceEditorValues) {
  return (
    v1.scooters.INSURANCE_FIELDS.some(
      (field) => field !== "currency" && Boolean(policy[field].trim()),
    ) ||
    policy.vinReviewConfirmed ||
    Boolean(policy.sourceFileNames?.length) ||
    policy.rawFields !== undefined
  );
}

export const DECIMAL_FIELDS = new Set<string>([
  "stationaryNoiseDb",
  "drivingNoiseDb",
  "co2EmissionsGKm",
  "powerKw",
  "electricMotorPowerKw",
  "powerToWeightRatioKwKg",
  "fuelTankCapacityLiters",
]);
export const BOOLEAN_FIELDS = new Set<string>([
  "hasGps",
  "odometerWorking",
  "speedometerWorking",
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
  "actualMaxSpeedKmh",
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
  const values: ScooterEditorValues = Object.fromEntries(
    CREATE_FIELDS.map((field) => [
      field,
      scooter?.[field] == null ? "" : String(scooter[field]),
    ]),
  ) as Record<ScooterEditorField, string>;
  if (!scooter) values.fleetNumber = null;
  values.civVersion = scooter?.civVersion ?? "unknown";
  values.powertrainType = scooter ? scooter.powertrainType : "combustion";
  if (!scooter) values.vehicleCategory = "L1e";
  values.registrationType = scooter?.registrationType ?? "";
  values.requiredLicenseCategory = scooter?.requiredLicenseCategory ?? "";
  values.insurancePolicies =
    scooter?.insurancePolicies?.map(insuranceEditorDefaults) ?? [];
  return values;
}

function convertValues(values: Partial<ScooterEditorValues>) {
  const inactive = v1.scooters.inactivePowertrainFields(
    values.powertrainType ?? "",
  );
  return Object.fromEntries(
    Object.entries(values)
      .filter(
        ([field]) => field !== "insurancePolicies" && field !== "fleetNumber",
      )
      .map(([field, raw = ""]) => {
        const value = raw as string;
        return [
          field,
          (inactive as readonly string[]).includes(field)
            ? null
            : field === "fuelType" && values.powertrainType === "electric"
              ? "electric"
              : field === "fuelTypeOther" &&
                  values.powertrainType === "electric"
                ? null
                : field.endsWith("Other") &&
                    values[field.slice(0, -5) as ScooterEditorField] !== "other"
                  ? null
                  : BOOLEAN_FIELDS.has(field)
                    ? value === ""
                      ? null
                      : value === "true"
                        ? true
                        : value === "false"
                          ? false
                          : value
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
        ];
      }),
  );
}

function convertForm(values: Partial<ScooterEditorValues>) {
  return {
    ...convertValues(values),
    ...(values.insurancePolicies
      ? {
          insurancePolicies: values.insurancePolicies.map((policy) => ({
            id: policy.id,
            vinReviewConfirmed: policy.vinReviewConfirmed,
            rawFields: policy.rawFields,
            insuredName: policy.insuredName.trim() || null,
            validFrom: policy.validFrom || null,
            validUntil: policy.validUntil || null,
            premiumAmount: v1.vehicleCiv.parseCivNumber(policy.premiumAmount),
            currency: policy.currency.trim().toUpperCase() || null,
            documentVin: policy.documentVin.trim().toUpperCase() || null,
          })),
        }
      : {}),
  };
}

const rawShape = Object.fromEntries(
  CREATE_FIELDS.map((field) => [field, z.string()]),
) as Record<ScooterEditorField, z.ZodString>;
const rawCreateSchema = z.object({
  ...rawShape,
  insurancePolicies: z.array(insuranceEditorSchema).optional(),
});

export const scooterCreateFormSchema = rawCreateSchema
  .extend({
    fleetNumber: z.string().nullable().optional(),
    insurancePolicies: z.array(insuranceEditorSchema).max(1).optional(),
  })
  .transform(
    (values) =>
      ({
        ...convertForm({
          ...values,
          insurancePolicies: values.insurancePolicies?.filter(
            insuranceEditorHasContent,
          ),
        }),
        ...(values.fleetNumber != null
          ? {
              fleetNumber: /^\d+$/.test(values.fleetNumber.trim())
                ? Number(values.fleetNumber)
                : Number.NaN,
            }
          : {}),
      }) as unknown as z.input<typeof v1.scooters.createScooterInputSchema>,
  )
  .pipe(v1.scooters.createScooterInputSchema)
  .transform((input) => {
    const plate = v1.scooters.validatePlateForRegistrationType(
      input.registrationType ?? "unregistered",
      input.registrationNumber,
    );
    return { ...input, registrationNumber: plate?.displayValue || null };
  });

// Create and edit share registration controls; updates still send only changed values.
export const scooterEditFormSchema = rawCreateSchema
  .transform(
    (values) =>
      convertForm({
        ...values,
        insurancePolicies: values.insurancePolicies?.filter(
          insuranceEditorHasContent,
        ),
      }) as unknown as z.input<typeof v1.scooters.updateScooterInputSchema>,
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
    CREATE_FIELDS.filter(
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

/** Action visibility depends on required fields; optional drafts still validate on submit. */
export function scooterRequiredFieldsValid(
  values: Partial<Omit<ScooterEditorValues, "insurancePolicies">>,
): boolean {
  const required = scooterEditorDefaults();
  for (const field of [
    "vin",
    "brandId",
    "powertrainType",
    "registrationType",
    "registrationNumber",
  ] as const) {
    required[field] = values[field] ?? "";
  }
  return scooterCreateFormSchema.safeParse(required).success;
}
