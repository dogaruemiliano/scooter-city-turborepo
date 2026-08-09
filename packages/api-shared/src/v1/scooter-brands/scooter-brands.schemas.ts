/**
 * Scooter-brands-domain Zod schemas.
 */
import { z } from "zod";

import { requiredTrimmedStringSchema } from "../common/common.schemas";

const MAX_NAME_LENGTH = 120;
const MIN_CODE_LENGTH = 2;
const MAX_CODE_LENGTH = 6;

const codeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(MIN_CODE_LENGTH)
      .max(MAX_CODE_LENGTH)
      .regex(/^[A-Z0-9]+$/, {
        message: "Code must contain only uppercase letters and digits.",
      }),
  );

export const scooterBrandSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string(),
    scooterCount: z
      .number()
      .int()
      .min(0)
      .describe("Number of scooters currently referencing this brand."),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "ScooterBrand" });

export type ScooterBrand = z.infer<typeof scooterBrandSchema>;

export const createScooterBrandInputSchema = z
  .object({
    name: requiredTrimmedStringSchema(MAX_NAME_LENGTH),
    code: codeSchema,
  })
  .strict()
  .meta({ id: "CreateScooterBrandInput" });

export type CreateScooterBrandInput = z.infer<
  typeof createScooterBrandInputSchema
>;

export const updateScooterBrandInputSchema = z
  .object({
    name: requiredTrimmedStringSchema(MAX_NAME_LENGTH).optional(),
    code: codeSchema.optional(),
  })
  .strict()
  .meta({ id: "UpdateScooterBrandInput" });

export type UpdateScooterBrandInput = z.infer<
  typeof updateScooterBrandInputSchema
>;

export const scooterBrandListSchema = z
  .object({
    items: z.array(scooterBrandSchema),
  })
  .meta({ id: "ScooterBrandList" });

export type ScooterBrandList = z.infer<typeof scooterBrandListSchema>;
