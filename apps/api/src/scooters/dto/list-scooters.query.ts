import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ListScootersQuery extends createZodDto(
  v1.scooters.listScootersQuerySchema,
) {}
