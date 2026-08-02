import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class CompanyStatsQuery extends createZodDto(
  v1.finance.companyStatsQuerySchema,
) {}
