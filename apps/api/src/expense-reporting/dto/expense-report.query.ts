import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ExpenseReportQuery extends createZodDto(
  v1.finance.expenseReportQuerySchema,
) {}
