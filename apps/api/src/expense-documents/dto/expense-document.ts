import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ExpenseDocument extends createZodDto(
  v1.finance.expenseDocumentSchema,
) {}
