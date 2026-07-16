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
  SCOOTER_LIST_SORTS,
  SCOOTER_POWERTRAIN_TYPES,
  SCOOTER_REGISTRATION_TYPES,
  SCOOTER_REQUIRED_DRIVER_LICENSE_TYPES,
} from "./scooters.constants";

const MAX_VIN_LENGTH = 17;
const MAX_TEXT_LENGTH = 120;
const MAX_COLOR_LENGTH = 50;
const MAX_NOTES_LENGTH = 2_000;
const MAX_SEARCH_LENGTH = 200;
const MAX_PAGE_SIZE = 100;
const MIN_MANUFACTURE_YEAR = 1950;
const MAX_MANUFACTURE_YEAR = new Date().getUTCFullYear() + 1;
const MAX_ENGINE_CC = 2_000;
const MAX_POWER_KW = 200;
const MAX_PLATE_INPUT_LENGTH = 64;
const PURCHASED_ON_FUTURE_MESSAGE = "Purchase date must be today or earlier.";
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
const notesSchema = nullableTrimmedStringSchema(MAX_NOTES_LENGTH);
const purchasedOnSchema = dateOnlySchema.refine(
  (value) => value <= dateOnlyToday(),
  {
    message: PURCHASED_ON_FUTURE_MESSAGE,
  },
);
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
  plateNumber: string | null | undefined,
): ScooterPlateValidationResult | null {
  if (registrationType === "unregistered") {
    return plateNumber == null || plateNumber.trim().length === 0
      ? {
          registrationType,
          displayValue: "",
          compactValue: "",
        }
      : null;
  }

  if (plateNumber == null || plateNumber.trim().length === 0) {
    return null;
  }

  switch (registrationType) {
    case "national":
      return normalizeNationalPlate(plateNumber);
    case "temporary":
      return normalizeTemporaryPlate(plateNumber);
    case "local":
      return normalizeLocalPlate(plateNumber);
  }
}

export const scooterSchema = z
  .object({
    id: z.string(),
    vin: z.string(),
    brand: z.string(),
    model: z.string(),
    color: z.string().nullable(),
    manufactureYear: z.number().int(),
    powertrainType: scooterPowertrainTypeSchema,
    engineCc: z.number().int().positive().nullable(),
    powerKw: z.number().positive().nullable(),
    purchasedOn: z.string(),
    registrationType: scooterRegistrationTypeSchema,
    plateNumber: z.string().nullable(),
    registeredOn: z.string().nullable(),
    registrationExpiresOn: z.string().nullable(),
    requiredDriverLicenseType: scooterRequiredDriverLicenseTypeSchema,
    notes: z.string().nullable(),
    createdAt: z.string().describe("ISO timestamp of scooter creation."),
    updatedAt: z.string().describe("ISO timestamp of last scooter update."),
    deletedAt: z.string().nullable(),
  })
  .meta({ id: "Scooter" });

export type Scooter = z.infer<typeof scooterSchema>;

export const createScooterInputSchema = z
  .object({
    vin: vinSchema,
    brand: requiredTrimmedStringSchema(MAX_TEXT_LENGTH),
    model: requiredTrimmedStringSchema(MAX_TEXT_LENGTH),
    color: nullableColorSchema.optional(),
    manufactureYear: z
      .number()
      .int()
      .min(MIN_MANUFACTURE_YEAR)
      .max(MAX_MANUFACTURE_YEAR),
    powertrainType: scooterPowertrainTypeSchema,
    engineCc: z
      .number()
      .int()
      .positive()
      .max(MAX_ENGINE_CC)
      .nullable()
      .optional(),
    powerKw: z.number().positive().max(MAX_POWER_KW).nullable().optional(),
    purchasedOn: purchasedOnSchema,
    registrationType: scooterRegistrationTypeSchema.optional(),
    plateNumber: plateNumberInputSchema.optional(),
    registeredOn: registeredOnSchema.nullable().optional(),
    registrationExpiresOn: dateOnlySchema.nullable().optional(),
    requiredDriverLicenseType:
      scooterRequiredDriverLicenseTypeSchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateScooterPowertrainForCreate(input, ctx);
    validateScooterRegistrationForCreate(input, ctx);
  })
  .meta({ id: "CreateScooterInput" });

export type CreateScooterInput = z.infer<typeof createScooterInputSchema>;

export const updateScooterInputSchema = z
  .object({
    vin: vinSchema.optional(),
    brand: requiredTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
    model: requiredTrimmedStringSchema(MAX_TEXT_LENGTH).optional(),
    color: nullableColorSchema.optional(),
    manufactureYear: z
      .number()
      .int()
      .min(MIN_MANUFACTURE_YEAR)
      .max(MAX_MANUFACTURE_YEAR)
      .optional(),
    powertrainType: scooterPowertrainTypeSchema.optional(),
    engineCc: z
      .number()
      .int()
      .positive()
      .max(MAX_ENGINE_CC)
      .nullable()
      .optional(),
    powerKw: z.number().positive().max(MAX_POWER_KW).nullable().optional(),
    purchasedOn: purchasedOnSchema.optional(),
    registrationType: scooterRegistrationTypeSchema.optional(),
    plateNumber: plateNumberInputSchema.optional(),
    registeredOn: registeredOnSchema.nullable().optional(),
    registrationExpiresOn: dateOnlySchema.nullable().optional(),
    requiredDriverLicenseType:
      scooterRequiredDriverLicenseTypeSchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateScooterPowertrainForUpdate(input, ctx);
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
    requiredDriverLicenseType:
      scooterRequiredDriverLicenseTypeSchema.optional(),
    sort: scooterListSortSchema.optional(),
    includeDeleted: queryBooleanSchema.default(false),
  })
  .strict()
  .meta({ id: "ListScootersQuery" });

export type ListScootersQuery = z.infer<typeof listScootersQuerySchema>;

export const scooterListSchema = z
  .object({
    items: z.array(scooterSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
  .meta({ id: "ScooterList" });

export type ScooterList = z.infer<typeof scooterListSchema>;

function normalizeNationalPlate(
  plateNumber: string,
): ScooterPlateValidationResult | null {
  const { compactValue } = normalizeScooterPlateNumber(plateNumber);
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
  plateNumber: string,
): ScooterPlateValidationResult | null {
  const { compactValue } = normalizeScooterPlateNumber(plateNumber);

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
  plateNumber: string,
): ScooterPlateValidationResult | null {
  const displayValue = plateNumber
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
    engineCc?: number | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.powertrainType === "combustion" && !input.engineCc) {
    ctx.addIssue({
      code: "custom",
      message: "Engine cc is required for combustion scooters.",
      path: ["engineCc"],
    });
  }

  if (input.powertrainType === "electric" && input.engineCc) {
    ctx.addIssue({
      code: "custom",
      message: "Engine cc is only allowed for combustion scooters.",
      path: ["engineCc"],
    });
  }
}

function validateScooterPowertrainForUpdate(
  input: {
    powertrainType?: z.infer<typeof scooterPowertrainTypeSchema>;
    engineCc?: number | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.powertrainType === "electric" && input.engineCc) {
    ctx.addIssue({
      code: "custom",
      message: "Engine cc is only allowed for combustion scooters.",
      path: ["engineCc"],
    });
  }

  if (input.powertrainType === "combustion" && input.engineCc === null) {
    ctx.addIssue({
      code: "custom",
      message: "Engine cc is required for combustion scooters.",
      path: ["engineCc"],
    });
  }
}

function validateScooterRegistrationForCreate(
  input: {
    registrationType?: z.infer<typeof scooterRegistrationTypeSchema>;
    plateNumber?: string | null;
    registeredOn?: string | null;
    registrationExpiresOn?: string | null;
    requiredDriverLicenseType?: z.infer<
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

  if (!input.plateNumber) {
    ctx.addIssue({
      code: "custom",
      message: "Plate number is required for registered scooters.",
      path: ["plateNumber"],
    });
  } else if (
    !validatePlateForRegistrationType(registrationType, input.plateNumber)
  ) {
    ctx.addIssue({
      code: "custom",
      message: INVALID_PLATE_MESSAGE,
      path: ["plateNumber"],
    });
  }

  if (!input.registeredOn) {
    ctx.addIssue({
      code: "custom",
      message: "Registration date is required for registered scooters.",
      path: ["registeredOn"],
    });
  }

  if (!input.requiredDriverLicenseType) {
    ctx.addIssue({
      code: "custom",
      message:
        "Required driver license type is required for registered scooters.",
      path: ["requiredDriverLicenseType"],
    });
  }

  if (registrationType === "temporary" && !input.registrationExpiresOn) {
    ctx.addIssue({
      code: "custom",
      message: "Registration expiry date is required for temporary plates.",
      path: ["registrationExpiresOn"],
    });
  }

  if (registrationType !== "temporary" && input.registrationExpiresOn) {
    ctx.addIssue({
      code: "custom",
      message: REGISTRATION_EXPIRES_ON_TEMPORARY_ONLY_MESSAGE,
      path: ["registrationExpiresOn"],
    });
  }
}

function validateScooterRegistrationForUpdate(
  input: {
    registrationType?: z.infer<typeof scooterRegistrationTypeSchema>;
    plateNumber?: string | null;
    registeredOn?: string | null;
    registrationExpiresOn?: string | null;
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
    input.registrationExpiresOn
  ) {
    ctx.addIssue({
      code: "custom",
      message: REGISTRATION_EXPIRES_ON_TEMPORARY_ONLY_MESSAGE,
      path: ["registrationExpiresOn"],
    });
  }

  if (input.registrationType && input.plateNumber) {
    if (
      !validatePlateForRegistrationType(
        input.registrationType,
        input.plateNumber,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: INVALID_PLATE_MESSAGE,
        path: ["plateNumber"],
      });
    }
  }
}

function validateUnregisteredFields(
  input: {
    plateNumber?: string | null;
    registeredOn?: string | null;
    registrationExpiresOn?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.plateNumber) {
    ctx.addIssue({
      code: "custom",
      message: "Plate number is only allowed for registered scooters.",
      path: ["plateNumber"],
    });
  }

  if (input.registeredOn) {
    ctx.addIssue({
      code: "custom",
      message: "Registration date is only allowed for registered scooters.",
      path: ["registeredOn"],
    });
  }

  if (input.registrationExpiresOn) {
    ctx.addIssue({
      code: "custom",
      message:
        "Registration expiry date is only allowed for registered scooters.",
      path: ["registrationExpiresOn"],
    });
  }
}

function validateRegistrationDates(
  input: {
    registeredOn?: string | null;
    registrationExpiresOn?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    input.registeredOn &&
    input.registrationExpiresOn &&
    input.registrationExpiresOn < input.registeredOn
  ) {
    ctx.addIssue({
      code: "custom",
      message: REGISTRATION_EXPIRES_ON_ORDER_MESSAGE,
      path: ["registrationExpiresOn"],
    });
  }
}
