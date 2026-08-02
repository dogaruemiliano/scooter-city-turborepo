import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ExpenseAttributionReport extends createZodDto(
  v1.finance.expenseAttributionReportSchema,
) {}
