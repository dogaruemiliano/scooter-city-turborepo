import { Module } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { ScooterDocumentExtractionService } from "./scooter-document-extraction.service";
import { SCOOTER_DOCUMENT_EXTRACTION_PROVIDER } from "./scooter-document-extraction.types";
import type { ScooterDocumentExtractionProvider } from "./scooter-document-extraction.types";

export function createScooterDocumentExtractionProvider(
  env: Env,
): ScooterDocumentExtractionProvider {
  if (env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER === "openai") {
    if (!env.SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY)
      throw new Error(
        "Scooter-document extraction requires a server-side API key.",
      );
    // Keep the legacy benchmark transport out of the web process's module
    // graph: importing it eagerly loads native canvas/PDF rendering libraries.
    const apiKey = env.SCOOTER_DOCUMENT_EXTRACTION_OPENAI_API_KEY;
    return {
      analyze: async (input) => {
        const { OpenAiScooterDocumentExtractionProvider } =
          await import("./openai-scooter-document-extraction.provider.js");
        return new OpenAiScooterDocumentExtractionProvider({
          apiKey,
          model: env.SCOOTER_DOCUMENT_EXTRACTION_MODEL,
          timeoutMs: env.SCOOTER_DOCUMENT_EXTRACTION_TIMEOUT_MS,
        }).analyze(input);
      },
    };
  }
  if (env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER === "fake") {
    if (env.NODE_ENV === "production")
      throw new Error(
        "Fake scooter-document extraction is forbidden in production.",
      );
    return {
      analyze: (input) =>
        Promise.resolve({
          detectedDocumentType: input.documentType,
          vin: null,
          fields: [
            {
              field:
                input.documentType === "insurance"
                  ? "insuredName"
                  : "brandName",
              value: "TEST FIXTURE",
              rawValue: "TEST FIXTURE",
              needsReview: true,
            },
          ],
          rawFields: [],
        }),
    };
  }
  return {
    analyze: () =>
      Promise.reject(
        new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_DISABLED",
          "Scooter-document extraction is disabled. Enter details manually.",
          false,
        ),
      ),
  };
}

@Module({
  providers: [
    {
      provide: SCOOTER_DOCUMENT_EXTRACTION_PROVIDER,
      inject: [ENV],
      useFactory: createScooterDocumentExtractionProvider,
    },
    ScooterDocumentExtractionService,
  ],
  exports: [ScooterDocumentExtractionService],
})
export class ScooterDocumentExtractionModule {}
