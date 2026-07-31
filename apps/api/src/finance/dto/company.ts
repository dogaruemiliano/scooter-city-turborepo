import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class Company extends createZodDto(v1.finance.companySchema) {}
