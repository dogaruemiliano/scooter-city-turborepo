import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ListWalletsQuery extends createZodDto(
  v1.finance.listWalletsQuerySchema,
) {}
