import { v1 } from "@repo/api-shared";

export interface AnalyzePersonDocumentInput {
  documentType: v1.persons.PersonDocumentType;
  nationalIdFormat?: v1.persons.PersonNationalIdFormat;
  sources: Array<{
    slot: v1.persons.PersonDocumentPhotoSlot;
    contentType: string;
    bytes: Uint8Array;
  }>;
}

/** Provider output is untrusted until the service validates and normalizes it. */
export interface PersonDocumentExtractionProvider {
  analyze(input: AnalyzePersonDocumentInput): Promise<unknown>;
}

export const PERSON_DOCUMENT_EXTRACTION_PROVIDER = Symbol(
  "PERSON_DOCUMENT_EXTRACTION_PROVIDER",
);
export const PERSON_DOCUMENT_EXTRACTION_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
