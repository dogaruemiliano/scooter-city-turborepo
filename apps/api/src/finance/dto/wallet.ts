import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class Wallet extends createZodDto(v1.finance.walletSchema) {}
