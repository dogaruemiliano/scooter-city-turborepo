import {
  insuranceAttentionSchema,
  insurancePoliciesInputSchema,
  insurancePolicySchema,
} from "./scooter-insurance.schemas";
import {
  civMetadataSchema,
  civAdditionalSpecificationsSchema,
} from "../vehicle-civ/vehicle-civ.schemas";
import {
  scooterDocumentDraftsSchema,
  scooterDocumentListSchema,
  SCOOTER_DOCUMENT_MAX_FILES,
} from "./scooter-documents.schemas";
import { scooterDocumentExtractionUpdateSchema } from "./scooter-document-extraction.schemas";
import { scooterPhotoDraftsSchema } from "./scooter-photos.schemas";
/**
 * Scooters-domain Zod schemas.
 */
import { z } from "zod";

import {
  dateOnlySchema,
  dateOnlyToday,
  nullableTrimmedStringSchema,
  optionalSearchStringSchema,
  queryBooleanSchema,
  requiredTrimmedStringSchema,
} from "../common/common.schemas";
import {
  inactivePowertrainFields,
  fuelMatchesPowertrain,
  SCOOTER_CIV_OPTIONS,
  SCOOTER_CIV_FIELDS,
  SCOOTER_LIST_SORTS,
  SCOOTER_POWERTRAIN_TYPES,
  SCOOTER_REGISTRATION_TYPES,
  SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES,
} from "./scooters.constants";

const MAX_VIN_LENGTH = 17;
const MAX_TEXT_LENGTH = 120;
const MAX_COLOR_LENGTH = 50;
const MAX_ENGINE_TYPE_LENGTH = 100;
const MAX_NOTES_LENGTH = 2_000;
const MAX_SEARCH_LENGTH = 200;
const MAX_PAGE_SIZE = 100;
const MIN_MANUFACTURE_YEAR = 1800;
const MAX_MANUFACTURE_YEAR = new Date().getUTCFullYear();
const MAX_ENGINE_CC = 2_147_483_647;
const MAX_MILEAGE_KM = 2_147_483_647;
const MAX_POWER_KW = Number.MAX_SAFE_INTEGER;
const MAX_PLATE_INPUT_LENGTH = 64;
const REGISTERED_ON_FUTURE_MESSAGE =
  "Registration date must be today or earlier.";
const REGISTRATION_EXPIRES_ON_ORDER_MESSAGE =
  "Registration expiry date must be on or after the registration date.";
const REGISTRATION_EXPIRES_ON_TEMPORARY_ONLY_MESSAGE =
  "Registration expiry date is only allowed for temporary registration.";
const INVALID_PLATE_MESSAGE =
  "Plate number does not match the selected registration type.";

const ROMANIAN_COUNTY_CODES = new Set([
  "AB",
  "AG",
  "AR",
  "BC",
  "BH",
  "BN",
  "BR",
  "BT",
  "BV",
  "BZ",
  "CJ",
  "CL",
  "CS",
  "CT",
  "CV",
  "DB",
  "DJ",
  "GJ",
  "GL",
  "GR",
  "HD",
  "HR",
  "IF",
  "IL",
  "IS",
  "MH",
  "MM",
  "MS",
  "NT",
  "OT",
  "PH",
  "SB",
  "SJ",
  "SM",
  "SV",
  "TL",
  "TM",
  "TR",
  "VL",
  "VN",
  "VS",
]);

const vinSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .length(MAX_VIN_LENGTH)
      .regex(/^[A-HJ-NPR-Z0-9]+$/, {
        message: "VIN must be 17 characters and cannot contain I, O, or Q.",
      }),
  );
const nullableColorSchema = nullableTrimmedStringSchema(MAX_COLOR_LENGTH);
const nullableEngineTypeSchema = nullableTrimmedStringSchema(
  MAX_ENGINE_TYPE_LENGTH,
);
const notesSchema = nullableTrimmedStringSchema(MAX_NOTES_LENGTH);
const registeredOnSchema = dateOnlySchema.refine(
  (value) => value <= dateOnlyToday(),
  {
    message: REGISTERED_ON_FUTURE_MESSAGE,
  },
);
const plateNumberInputSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? null : value,
  z.string().trim().max(MAX_PLATE_INPUT_LENGTH).nullable(),
);

export const scooterPowertrainTypeSchema = z.enum(SCOOTER_POWERTRAIN_TYPES);
export const scooterRegistrationTypeSchema = z.enum(SCOOTER_REGISTRATION_TYPES);
export const scooterRequiredDriverLicenseTypeSchema = z.enum(
  SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES,
);
export const scooterListSortSchema = z.enum(SCOOTER_LIST_SORTS);
export const mileageKmSchema = z.number().int().min(0).max(MAX_MILEAGE_KM);

export interface NormalizedScooterPlateNumber {
  displayValue: string;
  compactValue: string;
}

export interface ScooterPlateValidationResult extends NormalizedScooterPlateNumber {
  registrationType: z.infer<typeof scooterRegistrationTypeSchema>;
}

export function normalizeScooterPlateNumber(
  input: string,
): NormalizedScooterPlateNumber {
  const displayValue = input
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, " ");

  return {
    displayValue,
    compactValue: displayValue.replace(/\s+/g, ""),
  };
}

export function validatePlateForRegistrationType(
  registrationType: z.infer<typeof scooterRegistrationTypeSchema>,
  registrationNumber: string | null | undefined,
): ScooterPlateValidationResult | null {
  if (registrationType === "unregistered") {
    return registrationNumber == null || registrationNumber.trim().length === 0
      ? {
          registrationType,
          displayValue: "",
          compactValue: "",
        }
      : null;
  }

  if (registrationNumber == null || registrationNumber.trim().length === 0) {
    return null;
  }

  switch (registrationType) {
    case "national":
      return normalizeNationalPlate(registrationNumber);
    case "temporary":
      return normalizeTemporaryPlate(registrationNumber);
    case "local":
      return normalizeLocalPlate(registrationNumber);
  }
}

const nullableTechnicalIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(2_147_483_647)
  .nullable();

// Technical details may be omitted on create and explicitly cleared on update.
export const scooterTechnicalDetailsSchema = z.object({
  ...civAdditionalSpecificationsSchema.shape,
  vehicleType: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  civNumber: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  nationalEmissionsCode:
    nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  variant: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  version: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  commercialName: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  vehicleCategory: z
    .enum(SCOOTER_CIV_OPTIONS.vehicleCategory)
    .nullable()
    .optional(),
  vehicleCategoryOther: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  nationalCategory: z
    .enum(SCOOTER_CIV_OPTIONS.nationalCategory)
    .nullable()
    .optional(),
  nationalCategoryOther:
    nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  bodyType: z.enum(SCOOTER_CIV_OPTIONS.bodyType).nullable().optional(),
  bodyTypeOther: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  typeApprovalNumber: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  nationalRegistryNumber: nullableTrimmedStringSchema(MAX_TEXT_LENGTH)
    // This field is also in response DTOs, so preserve its JSON Schema type.
    .overwrite((value) => value?.toUpperCase() ?? null)
    .optional(),
  seatsCount: nullableTechnicalIntegerSchema.optional(),
  engineSerialNumber: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  ratedEngineRpm: nullableTechnicalIntegerSchema.optional(),
  fuelType: z.enum(SCOOTER_CIV_OPTIONS.fuelType).nullable().optional(),
  fuelTypeOther: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  propulsionSystem: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  electricMotorPowerKw: z.number().nonnegative().nullable().optional(),
  powerToWeightRatioKwKg: z.number().nonnegative().nullable().optional(),
  maxSpeedKmh: nullableTechnicalIntegerSchema.optional(),
  emissionsStandard: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  curbWeightKg: nullableTechnicalIntegerSchema.optional(),
  actualWeightKg: nullableTechnicalIntegerSchema.optional(),
  maxTechnicallyPermissibleMassKg: nullableTechnicalIntegerSchema.optional(),
  maxTrainMassKg: nullableTechnicalIntegerSchema.optional(),
  maxAxle1MassKg: nullableTechnicalIntegerSchema.optional(),
  maxAxle2MassKg: nullableTechnicalIntegerSchema.optional(),
  axlesCount: nullableTechnicalIntegerSchema.optional(),
  lengthMm: nullableTechnicalIntegerSchema.optional(),
  widthMm: nullableTechnicalIntegerSchema.optional(),
  heightMm: nullableTechnicalIntegerSchema.optional(),
  wheelbaseMm: nullableTechnicalIntegerSchema.optional(),
  frontTyreSpecification:
    nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  rearTyreSpecification:
    nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  frontSuspension: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  rearSuspension: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
  fuelTankCapacityLiters: z.number().nonnegative().nullable().optional(),
  registrationCertificateNumber:
    nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
});

export const scooterSchema = z
  .object({
    coverUrl: z.string().nullable().optional(),
    problemSeverityCounts: z
      .object({
        low: z.number().int().nonnegative(),
        moderate: z.number().int().nonnegative(),
        high: z.number().int().nonnegative(),
        critical: z.number().int().nonnegative(),
        unknown: z.number().int().nonnegative(),
      })
      .optional()
      .describe(
        "Counts of open or in-progress problems and any remaining usage blockers, grouped by severity.",
      ),
    maintenanceHoldCount: z.number().int().nonnegative().optional(),
    documents: scooterDocumentListSchema.optional(),
    insurancePolicies: z.array(insurancePolicySchema).optional(),
    insuranceAttention: insuranceAttentionSchema.nullable().optional(),
    ...civMetadataSchema.shape,
    ...scooterTechnicalDetailsSchema.shape,
    id: z.string(),
    fleetNumber: z
      .number()
      .int()
      .positive()
      .max(2_147_483_647)
      .describe("Permanent fleet-wide number, assigned by the server."),
    vin: z.string(),
    brandId: z.string(),
    brand: z.string().describe("Display name of the scooter's brand."),
    brandCode: z
      .string()
      .describe("Current short code of the scooter's brand."),
    model: z.string().nullable(),
    color: z.string().nullable(),
    manufactureYear: z.number().int().nullable(),
    powertrainType: scooterPowertrainTypeSchema,
    engineCode: z.string().nullable(),
    engineDisplacementCc: z.number().int().positive().nullable(),
    powerKw: z.number().positive().nullable(),
    registrationType: scooterRegistrationTypeSchema,
    registrationNumber: z.string().nullable(),
    registrationDate: z.string().nullable(),
    temporaryRegistrationExpiresAt: z.string().nullable(),
    requiredLicenseCategory: scooterRequiredDriverLicenseTypeSchema,
    currentMileageKm: mileageKmSchema.nullable(),
    hasGps: z.boolean().nullable(),
    odometerWorking: z.boolean().nullable(),
    speedometerWorking: z.boolean().nullable(),
    actualMaxSpeedKmh: nullableTechnicalIntegerSchema,
    notes: z.string().nullable(),
    createdAt: z.string().describe("ISO timestamp of scooter creation."),
    updatedAt: z.string().describe("ISO timestamp of last scooter update."),
    deletedAt: z.string().nullable(),
  })
  .meta({ id: "Scooter" });

export type Scooter = z.infer<typeof scooterSchema>;

export const createScooterInputSchema = z
  .object({
    photoDrafts: scooterPhotoDraftsSchema.optional(),
    sessionId: z.string().min(1).max(120).optional(),
    insurancePolicies: insurancePoliciesInputSchema.optional(),
    documentDrafts: scooterDocumentDraftsSchema.optional(),
    ...civMetadataSchema.shape,
    ...scooterTechnicalDetailsSchema.shape,
    vin: vinSchema,
    brandId: requiredTrimmedStringSchema(MAX_TEXT_LENGTH),
    model: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
    color: nullableColorSchema.optional(),
    manufactureYear: z
      .number()
      .int()
      .min(MIN_MANUFACTURE_YEAR)
      .max(MAX_MANUFACTURE_YEAR)
      .nullable()
      .optional(),
    powertrainType: scooterPowertrainTypeSchema,
    engineCode: nullableEngineTypeSchema.optional(),
    engineDisplacementCc: z
      .number()
      .int()
      .positive()
      .max(MAX_ENGINE_CC)
      .nullable()
      .optional(),
    powerKw: z.number().positive().max(MAX_POWER_KW).nullable().optional(),
    registrationType: scooterRegistrationTypeSchema.optional(),
    registrationNumber: plateNumberInputSchema.optional(),
    registrationDate: registeredOnSchema.nullable().optional(),
    temporaryRegistrationExpiresAt: dateOnlySchema.nullable().optional(),
    requiredLicenseCategory: scooterRequiredDriverLicenseTypeSchema.optional(),
    currentMileageKm: mileageKmSchema.nullable().optional(),
    hasGps: z.boolean().nullable().optional(),
    odometerWorking: z.boolean().nullable().optional(),
    speedometerWorking: z.boolean().nullable().optional(),
    actualMaxSpeedKmh: nullableTechnicalIntegerSchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateInsuranceVins(input, ctx);
    validateScooterPowertrainForCreate(input, ctx);
    validateScooterCivOptions(input, ctx);
    validateScooterRegistrationForCreate(input, ctx);
  })
  .meta({ id: "CreateScooterInput" });

export type CreateScooterInput = z.infer<typeof createScooterInputSchema>;

export const updateScooterInputSchema = z
  .object({
    sessionId: z.string().min(1).max(120).optional(),
    insurancePolicies: insurancePoliciesInputSchema.optional(),
    documentDrafts: scooterDocumentDraftsSchema.optional(),
    documentExtractions: z
      .array(scooterDocumentExtractionUpdateSchema)
      .max(SCOOTER_DOCUMENT_MAX_FILES)
      .refine(
        (items) =>
          new Set(items.map((item) => item.documentId)).size === items.length,
        "Duplicate document extraction IDs",
      )
      .optional(),
    removedDocumentIds: z
      .array(z.string().min(1))
      .max(SCOOTER_DOCUMENT_MAX_FILES)
      .optional(),
    ...civMetadataSchema.shape,
    ...scooterTechnicalDetailsSchema.shape,
    vin: vinSchema.optional(),
    brandId: requiredTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
    model: nullableTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
    color: nullableColorSchema.optional(),
    manufactureYear: z
      .number()
      .int()
      .min(MIN_MANUFACTURE_YEAR)
      .max(MAX_MANUFACTURE_YEAR)
      .nullable()
      .optional(),
    powertrainType: scooterPowertrainTypeSchema.optional(),
    engineCode: nullableEngineTypeSchema.optional(),
    engineDisplacementCc: z
      .number()
      .int()
      .positive()
      .max(MAX_ENGINE_CC)
      .nullable()
      .optional(),
    powerKw: z.number().positive().max(MAX_POWER_KW).nullable().optional(),
    registrationType: scooterRegistrationTypeSchema.optional(),
    registrationNumber: plateNumberInputSchema.optional(),
    registrationDate: registeredOnSchema.nullable().optional(),
    temporaryRegistrationExpiresAt: dateOnlySchema.nullable().optional(),
    requiredLicenseCategory: scooterRequiredDriverLicenseTypeSchema.optional(),
    currentMileageKm: mileageKmSchema.nullable().optional(),
    hasGps: z.boolean().nullable().optional(),
    odometerWorking: z.boolean().nullable().optional(),
    speedometerWorking: z.boolean().nullable().optional(),
    actualMaxSpeedKmh: nullableTechnicalIntegerSchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateInsuranceVins(input, ctx);
    validateScooterPowertrainForUpdate(input, ctx);
    validateScooterCivOptions(input, ctx, true);
    validateScooterRegistrationForUpdate(input, ctx);
  })
  .meta({ id: "UpdateScooterInput" });

export type UpdateScooterInput = z.infer<typeof updateScooterInputSchema>;

export const listScootersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    search: optionalSearchStringSchema(MAX_SEARCH_LENGTH),
    powertrainType: scooterPowertrainTypeSchema.optional(),
    registrationType: scooterRegistrationTypeSchema.optional(),
    requiredLicenseCategory: scooterRequiredDriverLicenseTypeSchema.optional(),
    sort: scooterListSortSchema.optional(),
    includeDeleted: queryBooleanSchema.default(false),
  })
  .strict()
  .meta({ id: "ListScootersQuery" });

export type ListScootersQuery = z.infer<typeof listScootersQuerySchema>;

export const scooterListItemSchema = scooterSchema.meta({
  id: "ScooterListItem",
});

export type ScooterListItem = z.infer<typeof scooterListItemSchema>;

export const scooterListSchema = z
  .object({
    items: z.array(scooterListItemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "ScooterList" });

export type ScooterList = z.infer<typeof scooterListSchema>;

function normalizeNationalPlate(
  registrationNumber: string,
): ScooterPlateValidationResult | null {
  const { compactValue } = normalizeScooterPlateNumber(registrationNumber);
  if (compactValue.includes("Q")) return null;

  const bucharestMatch = /^B(\d{2,3})([A-Z]{3})$/.exec(compactValue);
  if (bucharestMatch) {
    const codeDigits = bucharestMatch[1]!;
    const suffix = bucharestMatch[2]!;
    if (!isValidPermanentDigitGroup(codeDigits)) return null;
    if (!isValidPermanentLetterSuffix(suffix)) return null;
    return {
      registrationType: "national",
      displayValue: `B ${codeDigits} ${suffix}`,
      compactValue: `B${codeDigits}${suffix}`,
    };
  }

  const countyMatch = /^([A-Z]{2})(\d{2})([A-Z]{3})$/.exec(compactValue);
  if (!countyMatch) return null;

  const countyCode = countyMatch[1]!;
  const codeDigits = countyMatch[2]!;
  const suffix = countyMatch[3]!;
  if (!ROMANIAN_COUNTY_CODES.has(countyCode)) return null;
  if (!isValidPermanentDigitGroup(codeDigits)) return null;
  if (!isValidPermanentLetterSuffix(suffix)) return null;

  return {
    registrationType: "national",
    displayValue: `${countyCode} ${codeDigits} ${suffix}`,
    compactValue: `${countyCode}${codeDigits}${suffix}`,
  };
}

function normalizeTemporaryPlate(
  registrationNumber: string,
): ScooterPlateValidationResult | null {
  const { compactValue } = normalizeScooterPlateNumber(registrationNumber);

  const bucharestMatch = /^B(\d{3,6})$/.exec(compactValue);
  if (bucharestMatch) {
    return normalizeTemporaryMatch("B", bucharestMatch[1]!);
  }

  const countyMatch = /^([A-Z]{2})(\d{3,6})$/.exec(compactValue);
  if (!countyMatch) return null;

  const countyCode = countyMatch[1]!;
  const digits = countyMatch[2]!;
  if (!ROMANIAN_COUNTY_CODES.has(countyCode)) return null;

  return normalizeTemporaryMatch(countyCode, digits);
}

function normalizeTemporaryMatch(
  code: string,
  digits: string,
): ScooterPlateValidationResult | null {
  if (digits[0] !== "0" || digits[1] === "0") return null;

  return {
    registrationType: "temporary",
    displayValue: `${code} ${digits}`,
    compactValue: `${code}${digits}`,
  };
}

function normalizeLocalPlate(
  registrationNumber: string,
): ScooterPlateValidationResult | null {
  const displayValue = registrationNumber
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/-+/g, "-");

  if (!/^[A-Z0-9 -]{1,32}$/.test(displayValue)) return null;
  if (!/\d/.test(displayValue)) return null;
  if (/^[ -]|[ -]$/.test(displayValue)) return null;

  return {
    registrationType: "local",
    displayValue,
    compactValue: displayValue.replace(/[ -]+/g, ""),
  };
}

function isValidPermanentDigitGroup(value: string): boolean {
  return Number(value) > 0;
}

function isValidPermanentLetterSuffix(value: string): boolean {
  return (
    /^[A-Z]{3}$/.test(value) && !value.startsWith("I") && !value.startsWith("O")
  );
}

function validateScooterPowertrainForCreate(
  input: {
    powertrainType?: z.infer<typeof scooterPowertrainTypeSchema>;
  } & Record<string, unknown>,
  ctx: z.RefinementCtx,
): void {
  if (
    !fuelMatchesPowertrain(
      input.powertrainType,
      input.fuelType as string | null | undefined,
    )
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["fuelType"],
      message: "Fuel does not match the selected powertrain.",
    });
  }
  for (const field of inactivePowertrainFields(input.powertrainType ?? "")) {
    if (input[field] != null)
      ctx.addIssue({
        code: "custom",
        message: "This field does not apply to the selected powertrain.",
        path: [field],
      });
  }
}

const validateScooterPowertrainForUpdate = validateScooterPowertrainForCreate;

function validateScooterRegistrationForCreate(
  input: {
    registrationType?: z.infer<typeof scooterRegistrationTypeSchema>;
    registrationNumber?: string | null;
    registrationDate?: string | null;
    temporaryRegistrationExpiresAt?: string | null;
    requiredLicenseCategory?: z.infer<
      typeof scooterRequiredDriverLicenseTypeSchema
    >;
  },
  ctx: z.RefinementCtx,
): void {
  const registrationType = input.registrationType ?? "unregistered";

  validateRegistrationDates(input, ctx);

  if (registrationType === "unregistered") {
    validateUnregisteredFields(input, ctx);
    return;
  }

  if (!input.registrationNumber) {
    ctx.addIssue({
      code: "custom",
      message: "Plate number is required for registered scooters.",
      path: ["registrationNumber"],
    });
  } else if (
    !validatePlateForRegistrationType(
      registrationType,
      input.registrationNumber,
    )
  ) {
    ctx.addIssue({
      code: "custom",
      message: INVALID_PLATE_MESSAGE,
      path: ["registrationNumber"],
    });
  }

  if (
    registrationType !== "temporary" &&
    input.temporaryRegistrationExpiresAt
  ) {
    ctx.addIssue({
      code: "custom",
      message: REGISTRATION_EXPIRES_ON_TEMPORARY_ONLY_MESSAGE,
      path: ["temporaryRegistrationExpiresAt"],
    });
  }
}

function validateScooterRegistrationForUpdate(
  input: {
    registrationType?: z.infer<typeof scooterRegistrationTypeSchema>;
    registrationNumber?: string | null;
    registrationDate?: string | null;
    temporaryRegistrationExpiresAt?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  validateRegistrationDates(input, ctx);

  if (input.registrationType === "unregistered") {
    validateUnregisteredFields(input, ctx);
    return;
  }

  if (
    input.registrationType &&
    input.registrationType !== "temporary" &&
    input.temporaryRegistrationExpiresAt
  ) {
    ctx.addIssue({
      code: "custom",
      message: REGISTRATION_EXPIRES_ON_TEMPORARY_ONLY_MESSAGE,
      path: ["temporaryRegistrationExpiresAt"],
    });
  }

  if (input.registrationType && input.registrationNumber) {
    if (
      !validatePlateForRegistrationType(
        input.registrationType,
        input.registrationNumber,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: INVALID_PLATE_MESSAGE,
        path: ["registrationNumber"],
      });
    }
  }
}

function validateUnregisteredFields(
  input: {
    registrationNumber?: string | null;
    registrationDate?: string | null;
    temporaryRegistrationExpiresAt?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.registrationNumber) {
    ctx.addIssue({
      code: "custom",
      message: "Plate number is only allowed for registered scooters.",
      path: ["registrationNumber"],
    });
  }

  if (input.registrationDate) {
    ctx.addIssue({
      code: "custom",
      message: "Registration date is only allowed for registered scooters.",
      path: ["registrationDate"],
    });
  }

  if (input.temporaryRegistrationExpiresAt) {
    ctx.addIssue({
      code: "custom",
      message:
        "Registration expiry date is only allowed for registered scooters.",
      path: ["temporaryRegistrationExpiresAt"],
    });
  }
}

function validateRegistrationDates(
  input: {
    registrationDate?: string | null;
    temporaryRegistrationExpiresAt?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    input.registrationDate &&
    input.temporaryRegistrationExpiresAt &&
    input.temporaryRegistrationExpiresAt < input.registrationDate
  ) {
    ctx.addIssue({
      code: "custom",
      message: REGISTRATION_EXPIRES_ON_ORDER_MESSAGE,
      path: ["temporaryRegistrationExpiresAt"],
    });
  }
}

function validateScooterCivOptions(
  input: Record<string, unknown>,
  ctx: z.RefinementCtx,
  partial = false,
) {
  for (const field of SCOOTER_CIV_FIELDS) {
    if (input[field] === "other" && !input[`${field}Other`]) {
      ctx.addIssue({
        code: "custom",
        path: [`${field}Other`],
        message: "The exact CIV value is required.",
      });
    }
    if (
      (input[field] !== undefined || !partial) &&
      input[field] !== "other" &&
      input[`${field}Other`] != null
    ) {
      ctx.addIssue({
        code: "custom",
        path: [`${field}Other`],
        message: "Custom text is only allowed for other.",
      });
    }
  }
}

function validateInsuranceVins(
  input: { vin?: string; insurancePolicies?: { documentVin: string | null }[] },
  ctx: z.RefinementCtx,
) {
  if (!input.vin) return;
  input.insurancePolicies?.forEach((policy, index) => {
    if (policy.documentVin && policy.documentVin !== input.vin)
      ctx.addIssue({
        code: "custom",
        path: ["insurancePolicies", index, "documentVin"],
        message: "insuranceVinMismatch",
      });
  });
}
