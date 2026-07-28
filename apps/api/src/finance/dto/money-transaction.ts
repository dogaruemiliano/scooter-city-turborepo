import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class MoneyTransaction extends createZodDto(
  v1.finance.moneyTransactionSchema,
) {}
