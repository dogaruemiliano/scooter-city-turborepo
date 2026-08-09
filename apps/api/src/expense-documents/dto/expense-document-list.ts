import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ExpenseDocumentList extends createZodDto(
  v1.finance.expenseDocumentListSchema,
) {}
