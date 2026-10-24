import type { DocumentExtractionErrorCode } from "../document-extraction/document-extraction.errors";
import type {
  StoredDocument,
  SupportedDocumentContentType,
} from "../image-storage/image-storage.types";
import type { InvokeCommand } from "@aws-sdk/client-lambda";

export interface DocumentValidationInvocationResult {
  StatusCode?: number;
  FunctionError?: string;
  Payload?: Uint8Array;
}

export interface DocumentValidationClient {
  send(
    command: InvokeCommand,
    options: { abortSignal: AbortSignal },
  ): Promise<DocumentValidationInvocationResult>;
}

/** The provider receives storage references only, never document bytes. */
export interface ValidateDocumentInput {
  source: StoredDocument;
  outputKey: string;
}

export interface ValidatedDocument {
  storageKey: string;
  contentType: SupportedDocumentContentType;
  byteSize: number;
  checksumSha256: string;
  /** Original pages only; excludes optional analysis detail views. */
  originalPageCount?: number;
}

export type DocumentValidationResponse =
  | { ok: true; document: ValidatedDocument }
  | {
      ok: false;
      error: { code: DocumentExtractionErrorCode; retryable: boolean };
    };

export const DOCUMENT_VALIDATION_LAMBDA = Symbol("DOCUMENT_VALIDATION_LAMBDA");
/** Keep CloudFormation's hard execution limit and cleanup grace in sync. */
export const DOCUMENT_VALIDATION_MAX_RUNTIME_MS = 60_000;
export const DOCUMENT_VALIDATION_INVOKE_TIMEOUT_MS = 65_000;
export const DOCUMENT_VALIDATION_REVISION = "4";

export function isSafeDocumentStorageKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    !value.includes("\\") &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(value) &&
    value
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..")
  );
}

export function isDocumentAnalysisKey(
  key: unknown,
  prefix: string,
): key is string {
  if (!isSafeDocumentStorageKey(key)) return false;
  const temporaryPrefix = `${prefix}/extraction-temporary/`;
  return (
    key.startsWith(temporaryPrefix) &&
    /^[a-zA-Z0-9_-]{1,120}$/.test(key.slice(temporaryPrefix.length))
  );
}
