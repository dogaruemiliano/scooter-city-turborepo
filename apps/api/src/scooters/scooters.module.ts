import { Module } from "@nestjs/common";

import { ScootersController } from "./scooters.controller";
import { ScootersService } from "./scooters.service";

@Module({
  controllers: [ScootersController],
  providers: [ScootersService],
  exports: [ScootersService],
})
export class ScootersModule {}
