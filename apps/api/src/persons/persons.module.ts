import { UsersModule } from "../users/users.module";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { ImageStorageModule } from "../image-storage/image-storage.module";
import { DraftUploadCleanupService } from "./draft-upload-cleanup.service";
import { PersonsController } from "./persons.controller";
import { PersonsService } from "./persons.service";
import { PersonDocumentAnalysisService } from "./person-document-analysis.service";
import { PersonDocumentExtractionModule } from "../person-document-extraction/person-document-extraction.module";

@Module({
  imports: [
    ImageStorageModule,
    UsersModule,
    PersonDocumentExtractionModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [PersonsController],
  providers: [
    PersonsService,
    DraftUploadCleanupService,
    PersonDocumentAnalysisService,
  ],
  exports: [PersonsService],
})
export class PersonsModule {}
