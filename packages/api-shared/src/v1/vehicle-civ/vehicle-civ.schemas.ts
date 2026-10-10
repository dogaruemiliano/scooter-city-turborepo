import { z } from "zod";
import {
  dateOnlySchema,
  dateOnlyToday,
  nullableTrimmedStringSchema,
} from "../common/common.schemas";

export const CIV_VERSIONS = ["1993", "2016", "2024", "unknown"] as const;
export type CivVersion = (typeof CIV_VERSIONS)[number];
export const CIV_VOCABULARY_FIELDS = [
  "vehicleClass",
  "driveType",
  "color",
  "frontSuspension",
  "rearSuspension",
  "emissionsStandard",
  "nationalEmissionsCode",
] as const;
export type CivVocabularyField = (typeof CIV_VOCABULARY_FIELDS)[number];
export const civVocabularySchema = z
  .array(z.object({ field: z.enum(CIV_VOCABULARY_FIELDS), value: z.string() }))
  .meta({ id: "CivVocabulary" });
export const CIV_ROUTES = { vocabulary: "/v1/vehicle-civ/vocabulary" } as const;
export const civRawFieldsSchema = z
  .record(z.string().min(1).max(120), z.string().max(2000))
  .refine(
    (value) => Object.keys(value).length <= 100,
    "At most 100 original CIV fields are allowed.",
  );
const integer = z
  .number()
  .int()
  .nonnegative()
  .max(2147483647)
  .nullable()
  .optional();
const decimal = z
  .number()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .nullable()
  .optional();
const text = nullableTrimmedStringSchema(120).optional();

/** Document metadata is independent of the year the vehicle was manufactured. */
export const civMetadataSchema = z.object({
  civVersion: z.enum(CIV_VERSIONS).optional(),
  civIssuedAt: dateOnlySchema
    .refine(
      (date) => date <= dateOnlyToday(),
      "CIV issue date cannot be in the future.",
    )
    .nullable()
    .optional(),
  civIssuingAuthority: text,
  civRawFields: civRawFieldsSchema.nullable().optional(),
});

/** Additional normalized CIV values, usable for any vehicle category. */
export const civAdditionalSpecificationsSchema = z.object({
  maxAxle3MassKg: integer,
  maxAxle4MassKg: integer,
  maxAxle5MassKg: integer,
  brakedTrailerMassKg: integer,
  unbrakedTrailerMassKg: integer,
  couplingPointMassKg: integer,
  standingCapacity: integer,
  noiseMeasurementRpm: integer,
  stationaryNoiseDb: decimal,
  drivingNoiseDb: decimal,
  co2EmissionsGKm: decimal,
  vehicleClass: text,
  driveType: text,
  civMentions: nullableTrimmedStringSchema(10000).optional(),
});
export const CIV_ADDITIONAL_FIELDS = Object.keys(
  civAdditionalSpecificationsSchema.shape,
) as (keyof typeof civAdditionalSpecificationsSchema.shape)[];

/** A dash in a CIV denotes a missing/not applicable number; never a zero. */
export function parseCivNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value || value === "-") return null;
  return /^[+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)
    ? Number(value.replace(",", "."))
    : Number.NaN;
}
