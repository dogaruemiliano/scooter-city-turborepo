import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { ImageStorageModule } from "../image-storage/image-storage.module";
import { DraftUploadCleanupService } from "./draft-upload-cleanup.service";
import { PersonsController } from "./persons.controller";
import { PersonsService } from "./persons.service";

@Module({
  imports: [ImageStorageModule, ScheduleModule.forRoot()],
  controllers: [PersonsController],
  providers: [PersonsService, DraftUploadCleanupService],
  exports: [PersonsService],
})
export class PersonsModule {}
