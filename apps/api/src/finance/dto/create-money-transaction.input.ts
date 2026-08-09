import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CreateMoneyTransactionInput extends createZodDto(
  v1.finance.createMoneyTransactionInputSchema,
) {}
