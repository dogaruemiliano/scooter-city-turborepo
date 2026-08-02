import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ExpensePaymentSourceReport extends createZodDto(
  v1.finance.expensePaymentSourceReportSchema,
) {}
