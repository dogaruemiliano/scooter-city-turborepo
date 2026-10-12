import { CivVocabularyService } from "./civ-vocabulary.service";
import { CivVocabularyController } from "./civ-vocabulary.controller";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { ScooterDocumentsController } from "./scooter-documents.controller";
import { Module } from "@nestjs/common";
import { ScooterDocumentJobsModule } from "../scooter-document-jobs/scooter-document-jobs.module";

import { ScootersController } from "./scooters.controller";
import { ScootersService } from "./scooters.service";

@Module({
  imports: [ImageStorageModule, ScooterDocumentJobsModule],
  controllers: [
    CivVocabularyController,
    ScooterDocumentsController,
    ScootersController,
  ],
  providers: [ScootersService, CivVocabularyService],
  exports: [ScootersService],
})
export class ScootersModule {}
