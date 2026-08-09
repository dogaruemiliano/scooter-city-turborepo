import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreateScooterBrandInput extends createZodDto(
  v1.scooterBrands.createScooterBrandInputSchema,
) {}
