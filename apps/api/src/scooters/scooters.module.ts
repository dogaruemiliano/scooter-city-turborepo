import { CivVocabularyService } from "./civ-vocabulary.service";
import { CivVocabularyController } from "./civ-vocabulary.controller";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { ScooterDocumentsService } from "./scooter-documents.service";
import { ScooterDocumentsController } from "./scooter-documents.controller";
import { Module } from "@nestjs/common";
import { ScooterDocumentAnalysisService } from "./scooter-document-analysis.service";
import { ScooterDocumentExtractionModule } from "../scooter-document-extraction/scooter-document-extraction.module";

import { ScootersController } from "./scooters.controller";
import { ScootersService } from "./scooters.service";

@Module({
  imports: [ImageStorageModule, ScooterDocumentExtractionModule],
  controllers: [
    CivVocabularyController,
    ScooterDocumentsController,
    ScootersController,
  ],
  providers: [
    ScootersService,
    ScooterDocumentsService,
    ScooterDocumentAnalysisService,
    CivVocabularyService,
  ],
  exports: [ScootersService],
})
export class ScootersModule {}
