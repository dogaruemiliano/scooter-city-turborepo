import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreateFinancialCategoryInput extends createZodDto(
  v1.finance.createFinancialCategoryInputSchema,
) {}
