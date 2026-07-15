import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreateScooterInput extends createZodDto(
  v1.scooters.createScooterInputSchema,
) {}
