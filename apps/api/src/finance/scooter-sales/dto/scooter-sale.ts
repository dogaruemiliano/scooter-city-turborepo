import { v1 } from "@repo/api-shared";
import { createZodDto } from "nestjs-zod";

export class ScooterSale extends createZodDto(v1.finance.scooterSaleSchema) {}
