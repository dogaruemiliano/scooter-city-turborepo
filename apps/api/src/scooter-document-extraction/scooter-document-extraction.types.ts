import { v1 } from "@repo/api-shared";

export interface AnalyzeScooterDocumentInput {
  documentType: v1.scooters.ScooterDocumentType;
  bytes: Uint8Array;
  contentType: string;
  signal?: AbortSignal;
}

/** Model output remains untrusted until the service normalizes it. */
export interface ScooterDocumentExtractionProvider {
  analyze: (input: AnalyzeScooterDocumentInput) => Promise<unknown>;
}

export interface ScooterDocumentExtractionResult {
  extractedData: v1.scooters.ScooterDocumentExtractedData;
  issues: Array<{
    field: string;
    code:
      | "unreadable"
      | "invalidValue"
      | "conflictingValues"
      | "typeMismatch"
      | "noData";
  }>;
}

export const SCOOTER_DOCUMENT_EXTRACTION_PROVIDER = Symbol(
  "SCOOTER_DOCUMENT_EXTRACTION_PROVIDER",
);
