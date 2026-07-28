import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class OutstandingPersonalClaimList extends createZodDto(
  v1.finance.outstandingPersonalClaimListSchema,
) {}
