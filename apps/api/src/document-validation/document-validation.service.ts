import { Inject, Injectable } from "@nestjs/common";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { v1 } from "@repo/api-shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import {
  DOCUMENT_EXTRACTION_ERROR_CODES,
  DocumentExtractionError,
  type DocumentExtractionErrorCode,
} from "../document-extraction/document-extraction.errors";
import { SUPPORTED_DOCUMENT_CONTENT_TYPES } from "../image-storage/image-storage.types";
import {
  DOCUMENT_VALIDATION_INVOKE_TIMEOUT_MS,
  DOCUMENT_VALIDATION_LAMBDA,
  isDocumentAnalysisKey,
  isSafeDocumentStorageKey,
  type ValidatedDocument,
  type ValidateDocumentInput,
  type DocumentValidationClient,
} from "./document-validation.types";

/** No PDF/image parsers are imported into the HTTP/background API process. */
@Injectable()
export class DocumentValidationService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DOCUMENT_VALIDATION_LAMBDA)
    private readonly lambda: DocumentValidationClient,
  ) {}

  async validate(
    input: ValidateDocumentInput,
    signal?: AbortSignal,
  ): Promise<ValidatedDocument> {
    const prefix = this.env.IMAGE_STORAGE_S3_PREFIX.replace(/^\/+|\/+$/g, "");
    const limit = Math.min(
      this.env.IMAGE_STORAGE_MAX_BYTES,
      v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
    );
    const { source } = input;
    if (
      !isDocumentAnalysisKey(input.outputKey, prefix) ||
      source.provider !== "s3" ||
      source.bucket !== this.env.IMAGE_STORAGE_S3_BUCKET ||
      !isSafeDocumentStorageKey(source.storageKey) ||
      !source.storageKey.startsWith(`${prefix}/scooter-documents/`) ||
      !SUPPORTED_DOCUMENT_CONTENT_TYPES.includes(source.contentType) ||
      !Number.isInteger(source.byteSize) ||
      source.byteSize <= 0 ||
      !/^[a-f0-9]{64}$/i.test(source.checksumSha256)
    ) {
      throw failure("DOCUMENT_EXTRACTION_INVALID_SOURCE", false);
    }
    if (source.byteSize > limit)
      throw failure("DOCUMENT_EXTRACTION_TOO_LARGE", false);
    if (signal?.aborted) throw failure("DOCUMENT_EXTRACTION_UNAVAILABLE", true);
    // This fixture branch cannot activate in production and does no AWS I/O.
    if (
      this.env.NODE_ENV !== "production" &&
      this.env.SCOOTER_DOCUMENT_EXTRACTION_DRIVER === "fake"
    ) {
      return {
        storageKey: input.outputKey,
        contentType: source.contentType,
        byteSize: source.byteSize,
        checksumSha256: source.checksumSha256,
      };
    }
    const functionName =
      this.env.SCOOTER_DOCUMENT_VALIDATION_DRIVER === "local"
        ? "local-development"
        : this.env.SCOOTER_DOCUMENT_VALIDATION_FUNCTION_NAME;
    if (!functionName) throw failure("DOCUMENT_EXTRACTION_DISABLED", false);
    const timeout = AbortSignal.timeout(DOCUMENT_VALIDATION_INVOKE_TIMEOUT_MS);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeout])
      : timeout;
    try {
      const result = await this.lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          InvocationType: "RequestResponse",
          // Source checksums and storage identifiers are trusted metadata, not bytes.
          Payload: Buffer.from(JSON.stringify(input)),
        }),
        { abortSignal: combinedSignal },
      );
      if (
        result.StatusCode !== 200 ||
        result.FunctionError ||
        !result.Payload ||
        result.Payload.length > 8192
      )
        throw failure("DOCUMENT_EXTRACTION_UNAVAILABLE", true);
      const body: unknown = JSON.parse(
        Buffer.from(result.Payload).toString("utf8"),
      );
      if (!isRecord(body)) throw failure("DOCUMENT_EXTRACTION_FAILED", false);
      if (body.ok === false && isRecord(body.error)) {
        const code = body.error.code;
        if (
          typeof code === "string" &&
          DOCUMENT_EXTRACTION_ERROR_CODES.includes(
            code as DocumentExtractionErrorCode,
          ) &&
          typeof body.error.retryable === "boolean"
        )
          throw failure(
            code as DocumentExtractionErrorCode,
            body.error.retryable,
          );
        throw failure("DOCUMENT_EXTRACTION_FAILED", false);
      }
      const document = body.document;
      if (
        body.ok !== true ||
        !isRecord(document) ||
        document.storageKey !== input.outputKey ||
        document.contentType !== source.contentType ||
        typeof document.byteSize !== "number" ||
        !Number.isInteger(document.byteSize) ||
        document.byteSize <= 0 ||
        document.byteSize > limit ||
        typeof document.checksumSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(document.checksumSha256)
      )
        throw failure("DOCUMENT_EXTRACTION_FAILED", false);
      return {
        storageKey: input.outputKey,
        contentType: source.contentType,
        byteSize: document.byteSize,
        checksumSha256: document.checksumSha256,
      };
    } catch (error) {
      if (error instanceof DocumentExtractionError) throw error;
      if (timeout.aborted) throw failure("DOCUMENT_EXTRACTION_TIMEOUT", true);
      throw failure("DOCUMENT_EXTRACTION_UNAVAILABLE", true);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(code: DocumentExtractionErrorCode, retryable: boolean) {
  return new DocumentExtractionError(
    code,
    "Document validation could not be completed.",
    retryable,
  );
}
