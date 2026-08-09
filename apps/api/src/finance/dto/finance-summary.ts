import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class FinanceSummary extends createZodDto(
  v1.finance.financeSummarySchema,
) {}
