import { Global, Module } from "@nestjs/common";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DOCUMENT_EXTRACTION_PROVIDER } from "./document-extraction.constants";
import { DocumentExtractionService } from "./document-extraction.service";
import type { DocumentExtractionProvider } from "./document-extraction.types";
import { AwsTextractExpenseProvider } from "./providers/aws-textract-expense.provider";
import { DisabledDocumentExtractionProvider } from "./providers/disabled-document-extraction.provider";
import { FakeDocumentExtractionProvider } from "./providers/fake-document-extraction.provider";

@Global()
@Module({
  providers: [
    {
      provide: DOCUMENT_EXTRACTION_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): DocumentExtractionProvider => {
        switch (env.DOCUMENT_EXTRACTION_DRIVER) {
          case "textract": {
            const region = env.IMAGE_STORAGE_S3_REGION;
            if (!region) {
              throw new Error(
                "IMAGE_STORAGE_S3_REGION is required for Textract expense analysis.",
              );
            }
            return AwsTextractExpenseProvider.create(region);
          }
          case "fake":
            return new FakeDocumentExtractionProvider();
          case "disabled":
            return new DisabledDocumentExtractionProvider();
        }
      },
    },
    DocumentExtractionService,
  ],
  exports: [DocumentExtractionService],
})
export class DocumentExtractionModule {}
