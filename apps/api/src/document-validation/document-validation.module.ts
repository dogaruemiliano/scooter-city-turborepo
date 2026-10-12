import { Module } from "@nestjs/common";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DocumentValidationService } from "./document-validation.service";
import { DOCUMENT_VALIDATION_LAMBDA } from "./document-validation.types";
import { LocalDocumentValidationClient } from "./document-validation.local-client";

@Module({
  providers: [
    {
      provide: DOCUMENT_VALIDATION_LAMBDA,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.SCOOTER_DOCUMENT_VALIDATION_DRIVER === "local"
          ? new LocalDocumentValidationClient(env)
          : new LambdaClient({
              region: env.IMAGE_STORAGE_S3_REGION,
              // A timed-out invocation may still write its pre-registered snapshot.
              // The job scheduler owns retries and reconciliation, not this SDK.
              maxAttempts: 1,
            }),
    },
    DocumentValidationService,
  ],
  exports: [DocumentValidationService],
})
export class DocumentValidationModule {}
