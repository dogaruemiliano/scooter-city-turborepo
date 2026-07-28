import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class WalletList extends createZodDto(v1.finance.walletListSchema) {}
