export const DOCUMENT_EXTRACTION_ERROR_CODES = [
  "DOCUMENT_EXTRACTION_DISABLED",
  "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
  "DOCUMENT_EXTRACTION_TOO_LARGE",
  "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
  "DOCUMENT_EXTRACTION_ACCESS_DENIED",
  "DOCUMENT_EXTRACTION_INVALID_SOURCE",
  "DOCUMENT_EXTRACTION_THROTTLED",
  "DOCUMENT_EXTRACTION_UNAVAILABLE",
  "DOCUMENT_EXTRACTION_FAILED",
] as const;

export type DocumentExtractionErrorCode =
  (typeof DOCUMENT_EXTRACTION_ERROR_CODES)[number];

/** Stable application error; provider messages can contain sensitive data. */
export class DocumentExtractionError extends Error {
  constructor(
    readonly code: DocumentExtractionErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DocumentExtractionError";
  }
}
