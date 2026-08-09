import { Module } from "@nestjs/common";

import { MaintenanceModule } from "../maintenance/maintenance.module";
import { ScootersController } from "./scooters.controller";
import { ScootersService } from "./scooters.service";

@Module({
  imports: [MaintenanceModule],
  controllers: [ScootersController],
  providers: [ScootersService],
  exports: [ScootersService],
})
export class ScootersModule {}
