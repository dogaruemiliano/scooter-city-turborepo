import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ScooterBrand extends createZodDto(
  v1.scooterBrands.scooterBrandSchema,
) {}
