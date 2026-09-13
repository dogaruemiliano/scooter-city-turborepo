import { Module } from "@nestjs/common";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { OpenAiPersonDocumentExtractionProvider } from "./openai-person-document-extraction.provider";
import { PersonDocumentExtractionService } from "./person-document-extraction.service";
import { PERSON_DOCUMENT_EXTRACTION_PROVIDER } from "./person-document-extraction.types";
import type { PersonDocumentExtractionProvider } from "./person-document-extraction.types";

@Module({
  providers: [
    {
      provide: PERSON_DOCUMENT_EXTRACTION_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): PersonDocumentExtractionProvider => {
        if (env.PERSON_DOCUMENT_EXTRACTION_DRIVER === "openai") {
          if (!env.PERSON_DOCUMENT_EXTRACTION_OPENAI_API_KEY) {
            throw new Error("Person-document extraction requires an API key.");
          }
          return new OpenAiPersonDocumentExtractionProvider({
            apiKey: env.PERSON_DOCUMENT_EXTRACTION_OPENAI_API_KEY,
            model: env.PERSON_DOCUMENT_EXTRACTION_MODEL,
            timeoutMs: env.PERSON_DOCUMENT_EXTRACTION_TIMEOUT_MS,
          });
        }
        if (env.PERSON_DOCUMENT_EXTRACTION_DRIVER === "fake") {
          if (env.NODE_ENV === "production") {
            throw new Error(
              "Fake person-document extraction is forbidden in production.",
            );
          }
          // An explicitly synthetic, unverified fixture. Never infer licence
          // categories or populate plausible production identity information.
          return {
            analyze: (input) =>
              Promise.resolve({
                detectedDocumentType: input.documentType,
                suggestions: [
                  {
                    target: "person",
                    field: "firstName",
                    value: "TEST FIXTURE",
                    sourceSlot: input.sources[0].slot,
                    needsReview: true,
                  },
                ],
                licenseCategories: [],
                warnings: ["unclearText"],
              }),
          };
        }
        return {
          analyze: () =>
            Promise.reject(
              new DocumentExtractionError(
                "DOCUMENT_EXTRACTION_DISABLED",
                "Person-document extraction is disabled. Enter details manually.",
                false,
              ),
            ),
        };
      },
    },
    PersonDocumentExtractionService,
  ],
  exports: [PersonDocumentExtractionService],
})
export class PersonDocumentExtractionModule {}
