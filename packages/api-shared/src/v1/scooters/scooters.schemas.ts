/**
 * Scooters-domain Zod schemas.
 *
 * This first slice models scooters after purchase/arrival, before Romanian
 * registration details such as plate number and talon are available.
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
  SCOOTER_REGISTRATION_STATUSES,
} from "./scooters.constants";

const MAX_VIN_LENGTH = 17;
const MAX_TEXT_LENGTH = 120;
const MAX_COLOR_LENGTH = 50;
const MAX_NOTES_LENGTH = 2_000;
const MAX_SEARCH_LENGTH = 200;
const MAX_PAGE_SIZE = 100;
const MIN_MANUFACTURE_YEAR = 1950;
const MAX_MANUFACTURE_YEAR = new Date().getUTCFullYear() + 1;
const MAX_CYLINDER_CAPACITY_CC = 2_000;
const PURCHASED_ON_FUTURE_MESSAGE = "Purchase date must be today or earlier.";

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

export const scooterPowertrainTypeSchema = z.enum(SCOOTER_POWERTRAIN_TYPES);
export const scooterRegistrationStatusSchema = z.enum(
  SCOOTER_REGISTRATION_STATUSES,
);
export const scooterListSortSchema = z.enum(SCOOTER_LIST_SORTS);

export const scooterSchema = z
  .object({
    id: z.string(),
    vin: z.string(),
    brand: z.string(),
    model: z.string(),
    color: z.string().nullable(),
    manufactureYear: z.number().int(),
    powertrainType: scooterPowertrainTypeSchema,
    cylinderCapacityCc: z.number().int().positive().nullable(),
    purchasedOn: z.string(),
    registrationStatus: scooterRegistrationStatusSchema,
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
    cylinderCapacityCc: z
      .number()
      .int()
      .positive()
      .max(MAX_CYLINDER_CAPACITY_CC)
      .nullable()
      .optional(),
    purchasedOn: purchasedOnSchema,
    notes: notesSchema.optional(),
  })
  .strict()
  .superRefine(validateScooterPowertrain)
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
    cylinderCapacityCc: z
      .number()
      .int()
      .positive()
      .max(MAX_CYLINDER_CAPACITY_CC)
      .nullable()
      .optional(),
    purchasedOn: purchasedOnSchema.optional(),
    notes: notesSchema.optional(),
  })
  .strict()
  .meta({ id: "UpdateScooterInput" });

export type UpdateScooterInput = z.infer<typeof updateScooterInputSchema>;

export const listScootersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
    search: optionalSearchStringSchema(MAX_SEARCH_LENGTH),
    powertrainType: scooterPowertrainTypeSchema.optional(),
    registrationStatus: scooterRegistrationStatusSchema.optional(),
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

function validateScooterPowertrain(
  input: {
    powertrainType?: z.infer<typeof scooterPowertrainTypeSchema>;
    cylinderCapacityCc?: number | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.powertrainType === "combustion" && !input.cylinderCapacityCc) {
    ctx.addIssue({
      code: "custom",
      message: "Cylinder capacity is required for combustion scooters.",
      path: ["cylinderCapacityCc"],
    });
  }

  if (input.powertrainType === "electric" && input.cylinderCapacityCc) {
    ctx.addIssue({
      code: "custom",
      message: "Cylinder capacity is only allowed for combustion scooters.",
      path: ["cylinderCapacityCc"],
    });
  }
}
