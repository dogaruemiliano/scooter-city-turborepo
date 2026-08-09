import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class FinancialCategory extends createZodDto(
  v1.finance.financialCategorySchema,
) {}
