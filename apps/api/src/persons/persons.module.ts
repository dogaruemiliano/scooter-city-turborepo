import { Module } from "@nestjs/common";

import { ImageStorageModule } from "../image-storage/image-storage.module";
import { PersonsController } from "./persons.controller";
import { PersonsService } from "./persons.service";

@Module({
  imports: [ImageStorageModule],
  controllers: [PersonsController],
  providers: [PersonsService],
  exports: [PersonsService],
})
export class PersonsModule {}
