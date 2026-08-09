import { Module } from "@nestjs/common";

import { ScooterBrandsController } from "./scooter-brands.controller";
import { ScooterBrandsService } from "./scooter-brands.service";

@Module({
  controllers: [ScooterBrandsController],
  providers: [ScooterBrandsService],
  exports: [ScooterBrandsService],
})
export class ScooterBrandsModule {}
