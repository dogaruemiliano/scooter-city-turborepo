import { Module } from "@nestjs/common";

import {
  MaintenanceController,
  ScooterMaintenanceController,
} from "./maintenance.controller";
import { MaintenanceQueryService } from "./maintenance-query.service";
import { MaintenanceService } from "./maintenance.service";

@Module({
  controllers: [MaintenanceController, ScooterMaintenanceController],
  providers: [MaintenanceService, MaintenanceQueryService],
  exports: [MaintenanceQueryService],
})
export class MaintenanceModule {}
