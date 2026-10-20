import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class NextScooterFleetNumber extends createZodDto(
  v1.scooters.nextScooterFleetNumberSchema,
) {}
