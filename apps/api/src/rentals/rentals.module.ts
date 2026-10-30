import { RentalMediaController } from "./rental-media.controller";
import { RentalMediaService } from "./rental-media.service";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { Module } from "@nestjs/common";
import { RentalsController } from "./rentals.controller";
import { RentalsService } from "./rentals.service";

@Module({
  imports: [ImageStorageModule],
  controllers: [RentalsController, RentalMediaController],
  providers: [RentalsService, RentalMediaService],
})
export class RentalsModule {}
