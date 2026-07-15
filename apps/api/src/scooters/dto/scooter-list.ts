import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ScooterList extends createZodDto(v1.scooters.scooterListSchema) {}
