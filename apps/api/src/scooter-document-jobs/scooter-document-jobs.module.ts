import { Module } from "@nestjs/common";
import { DocumentValidationModule } from "../document-validation/document-validation.module";
import { ImageStorageModule } from "../image-storage/image-storage.module";
import { OpenAiScooterDocumentJobProvider } from "../scooter-document-extraction/openai-scooter-document-job.provider";
import { ScooterDocumentExtractionModule } from "../scooter-document-extraction/scooter-document-extraction.module";
import { ScooterDocumentWebhookController } from "../scooter-document-extraction/scooter-document-webhook.controller";
import { ScooterDocumentsService } from "../scooters/scooter-documents.service";
import { ScooterDocumentJobsService } from "./scooter-document-jobs.service";
import { ScooterDocumentDispatcherService } from "./scooter-document-dispatcher.service";
import { ScooterDocumentCleanupService } from "./scooter-document-cleanup.service";

@Module({
  imports: [
    ImageStorageModule,
    DocumentValidationModule,
    ScooterDocumentExtractionModule,
  ],
  controllers: [ScooterDocumentWebhookController],
  providers: [
    ScooterDocumentsService,
    ScooterDocumentJobsService,
    ScooterDocumentDispatcherService,
    ScooterDocumentCleanupService,
    OpenAiScooterDocumentJobProvider,
  ],
  exports: [ScooterDocumentsService, ScooterDocumentJobsService],
})
export class ScooterDocumentJobsModule {}
