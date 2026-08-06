import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ScooterSaleDocument extends createZodDto(
  v1.finance.scooterSaleDocumentSchema,
) {}
