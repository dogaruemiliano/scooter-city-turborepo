import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ListMoneyTransactionsQuery extends createZodDto(
  v1.finance.listMoneyTransactionsQuerySchema,
) {}
