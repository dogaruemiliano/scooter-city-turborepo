import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class FinanceSummaryQuery extends createZodDto(
  v1.finance.financeSummaryQuerySchema,
) {}
