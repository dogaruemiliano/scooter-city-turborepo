import { CivVocabularyService } from "./civ-vocabulary.service";
import { CivVocabularyController } from "./civ-vocabulary.controller";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { ScooterDocumentsController } from "./scooter-documents.controller";
import { Module } from "@nestjs/common";
import { ScooterDocumentJobsModule } from "../scooter-document-jobs/scooter-document-jobs.module";
import { ScooterDocumentJobsController } from "../scooter-document-jobs/scooter-document-jobs.controller";

import { ScootersController } from "./scooters.controller";
import { ScootersService } from "./scooters.service";
import { ScooterItpController } from "./scooter-itp.controller";
import { ScooterItpService } from "./scooter-itp.service";
import {
  ScooterPhotosController,
  ScooterPhotoDraftsController,
} from "./scooter-photos.controller";
import { ScooterPhotosService } from "./scooter-photos.service";

@Module({
  imports: [ImageStorageModule, ScooterDocumentJobsModule],
  controllers: [
    // Literal import-draft routes must precede ScootersController's GET :id.
    ScooterDocumentJobsController,
    CivVocabularyController,
    ScooterItpController,
    ScooterDocumentsController,
    ScootersController,
    ScooterPhotosController,
    ScooterPhotoDraftsController,
  ],
  providers: [
    ScootersService,
    CivVocabularyService,
    ScooterPhotosService,
    ScooterItpService,
  ],
  exports: [ScootersService],
})
export class ScootersModule {}
