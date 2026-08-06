import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CompleteScooterSaleDocumentUploadInput extends createZodDto(
  v1.finance.completeScooterSaleDocumentUploadInputSchema,
) {}
