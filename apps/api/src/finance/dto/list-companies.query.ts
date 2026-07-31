import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ListCompaniesQuery extends createZodDto(
  v1.finance.listCompaniesQuerySchema,
) {}
