import { Module } from "@nestjs/common";

import {
  ScooterFinancialsController,
  ScooterSalesController,
} from "./scooter-sales.controller";
import { ScooterSalesService } from "./scooter-sales.service";

@Module({
  controllers: [ScooterSalesController, ScooterFinancialsController],
  providers: [ScooterSalesService],
  exports: [ScooterSalesService],
})
export class ScooterSalesModule {}
