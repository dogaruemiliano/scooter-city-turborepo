import { Module } from "@nestjs/common";

import { ImageStorageModule } from "../../image-storage/image-storage.module";
import { ScooterSaleDocumentsController } from "./scooter-sale-documents.controller";
import { ScooterSaleDocumentsService } from "./scooter-sale-documents.service";

@Module({
  imports: [ImageStorageModule],
  controllers: [ScooterSaleDocumentsController],
  providers: [ScooterSaleDocumentsService],
  exports: [ScooterSaleDocumentsService],
})
export class ScooterSaleDocumentsModule {}
