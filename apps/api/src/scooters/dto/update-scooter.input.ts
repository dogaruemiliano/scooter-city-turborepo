import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class UpdateScooterInput extends createZodDto(
  v1.scooters.updateScooterInputSchema,
) {}
