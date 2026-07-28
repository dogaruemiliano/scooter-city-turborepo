import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class MoneyTransactionList extends createZodDto(
  v1.finance.moneyTransactionListSchema,
) {}
