import { Module } from "@nestjs/common";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";

@Module({
  imports: [ImageStorageModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
