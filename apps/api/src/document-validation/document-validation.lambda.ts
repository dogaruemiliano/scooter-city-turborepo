import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { v1 } from "@repo/api-shared";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import {
  SUPPORTED_DOCUMENT_CONTENT_TYPES,
  type StoredDocument,
} from "../image-storage/image-storage.types";
import { readScooterDocumentSource } from "../scooters/scooter-document-source-reader";
import { normalizeDocumentAnalysisPdf } from "./document-analysis-pdf";
import {
  DOCUMENT_VALIDATION_MAX_RUNTIME_MS,
  DOCUMENT_VALIDATION_REVISION,
  isDocumentAnalysisKey,
  isSafeDocumentStorageKey,
  type DocumentValidationResponse,
  type ValidatedDocument,
  type ValidateDocumentInput,
} from "./document-validation.types";

export interface DocumentValidationConfiguration {
  bucket: string;
  prefix: string;
  maxBytes: number;
  kmsKeyId?: string;
}

interface LambdaContext {
  getRemainingTimeInMillis(): number;
}

/** Runs in Lambda or the isolated development worker; never register this handler in Nest. */
export function createDocumentValidationHandler(
  s3: Pick<S3Client, "send">,
  config: DocumentValidationConfiguration,
) {
  return async (
    event: unknown,
    context?: LambdaContext,
  ): Promise<DocumentValidationResponse> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      const input = validateInput(event, config);
      const duration = Math.max(
        1,
        Math.min(
          DOCUMENT_VALIDATION_MAX_RUNTIME_MS - 5_000,
          (context?.getRemainingTimeInMillis() ??
            DOCUMENT_VALIDATION_MAX_RUNTIME_MS) - 2_000,
        ),
      );
      timer = setTimeout(() => controller.abort(), duration);
      const sourceFingerprint = fingerprint(input.source);
      const existing = await existingSnapshot(
        s3,
        config,
        input,
        sourceFingerprint,
        controller.signal,
      );
      if (existing) return { ok: true, document: existing };
      const originalBytes = await readScooterDocumentSource(
        {
          readDocument: async (storageKey, signal) => {
            const result = await s3.send(
              new GetObjectCommand({ Bucket: config.bucket, Key: storageKey }),
              { abortSignal: signal },
            );
            if (!(result.Body instanceof Readable)) {
              throw new DocumentExtractionError(
                "DOCUMENT_EXTRACTION_READ_FAILED",
                "Document stream is unavailable.",
                true,
              );
            }
            return {
              body: result.Body,
              contentType: result.ContentType ?? null,
              contentLength: result.ContentLength ?? null,
            };
          },
        },
        input.source,
        Math.min(config.maxBytes, v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      const bytes =
        input.source.contentType === "application/pdf"
          ? await normalizeDocumentAnalysisPdf(
              originalBytes,
              Math.min(config.maxBytes, v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES),
              controller.signal,
            )
          : originalBytes;
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: input.outputKey,
            Body: bytes,
            ContentType: input.source.contentType,
            ContentLength: bytes.length,
            ChecksumSHA256: Buffer.from(checksumSha256, "hex").toString(
              "base64",
            ),
            IfNoneMatch: "*",
            Metadata: {
              "source-fingerprint": sourceFingerprint,
              "validation-revision": DOCUMENT_VALIDATION_REVISION,
            },
            ...(config.kmsKeyId
              ? {
                  ServerSideEncryption: "aws:kms" as const,
                  SSEKMSKeyId: config.kmsKeyId,
                }
              : {}),
          }),
          { abortSignal: controller.signal },
        );
      } catch (error) {
        if (!isConditionalConflict(error)) throw error;
        // Repeated/concurrent deliveries reuse the reserved immutable snapshot.
        const winner = await existingSnapshot(
          s3,
          config,
          input,
          sourceFingerprint,
          controller.signal,
        );
        if (winner) return { ok: true, document: winner };
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_UNAVAILABLE",
          "Document preparation must be retried.",
          true,
        );
      }
      return {
        ok: true,
        document: {
          storageKey: input.outputKey,
          contentType: input.source.contentType,
          byteSize: bytes.length,
          checksumSha256,
        },
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          ok: false,
          error: { code: "DOCUMENT_EXTRACTION_TIMEOUT", retryable: true },
        };
      }
      if (error instanceof DocumentExtractionError) {
        return {
          ok: false,
          error: { code: error.code, retryable: error.retryable },
        };
      }
      // Neither S3 keys, signed URLs, document contents nor parser errors are logged.
      return {
        ok: false,
        error: { code: "DOCUMENT_EXTRACTION_UNAVAILABLE", retryable: true },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

function validateInput(
  event: unknown,
  config: DocumentValidationConfiguration,
): ValidateDocumentInput {
  const invalid = () =>
    new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_INVALID_SOURCE",
      "Invalid document source.",
      false,
    );
  if (
    !config.bucket ||
    !isSafeDocumentStorageKey(config.prefix) ||
    !Number.isInteger(config.maxBytes) ||
    config.maxBytes <= 0 ||
    typeof event !== "object" ||
    event === null
  )
    throw invalid();
  const input = event as Partial<ValidateDocumentInput>;
  const source = input.source;
  if (
    !source ||
    source.provider !== "s3" ||
    source.bucket !== config.bucket ||
    !isSafeDocumentStorageKey(source.storageKey) ||
    !source.storageKey.startsWith(`${config.prefix}/scooter-documents/`) ||
    !SUPPORTED_DOCUMENT_CONTENT_TYPES.includes(source.contentType) ||
    !Number.isInteger(source.byteSize) ||
    source.byteSize <= 0 ||
    typeof source.checksumSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(source.checksumSha256) ||
    !isDocumentAnalysisKey(input.outputKey, config.prefix)
  )
    throw invalid();
  if (
    source.byteSize >
    Math.min(config.maxBytes, v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES)
  ) {
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_LARGE",
      "Document is too large.",
      false,
    );
  }
  return { source, outputKey: input.outputKey };
}

function fingerprint(source: StoredDocument): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        source.bucket,
        source.storageKey,
        source.contentType,
        source.byteSize,
        source.checksumSha256.toLowerCase(),
        DOCUMENT_VALIDATION_REVISION,
      ]),
    )
    .digest("hex");
}

async function existingSnapshot(
  s3: Pick<S3Client, "send">,
  config: DocumentValidationConfiguration,
  input: ValidateDocumentInput,
  sourceFingerprint: string,
  signal: AbortSignal,
): Promise<ValidatedDocument | null> {
  // A prefix-scoped ListBucket grant cannot be assumed to make a missing HEAD
  // return 404. Test existence with an explicitly scoped list first, without
  // broadening the Lambda role to enumerate unrelated application documents.
  const listing = await s3.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: input.outputKey,
      MaxKeys: 1,
    }),
    { abortSignal: signal },
  );
  if (!listing.Contents?.some((object) => object.Key === input.outputKey))
    return null;
  let head: HeadObjectCommandOutput;
  try {
    head = await s3.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: input.outputKey,
        ChecksumMode: "ENABLED",
      }),
      { abortSignal: signal },
    );
  } catch (error) {
    if (
      errorName(error) === "NotFound" ||
      errorName(error) === "NoSuchKey" ||
      statusCode(error) === 404
    )
      return null;
    throw error;
  }
  const checksum = head.ChecksumSHA256
    ? Buffer.from(head.ChecksumSHA256, "base64")
    : null;
  if (
    head.Metadata?.["source-fingerprint"] !== sourceFingerprint ||
    head.Metadata?.["validation-revision"] !== DOCUMENT_VALIDATION_REVISION ||
    head.ContentType !== input.source.contentType ||
    !Number.isInteger(head.ContentLength) ||
    !head.ContentLength ||
    head.ContentLength < 1 ||
    head.ContentLength >
      Math.min(config.maxBytes, v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES) ||
    head.ChecksumType === "COMPOSITE" ||
    checksum?.length !== 32
  )
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_INVALID_SOURCE",
      "Reserved document snapshot does not match.",
      false,
    );
  return {
    storageKey: input.outputKey,
    contentType: input.source.contentType,
    byteSize: head.ContentLength,
    checksumSha256: checksum.toString("hex"),
  };
}

function errorName(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : undefined;
}

function statusCode(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "$metadata" in error
    ? (error.$metadata as { httpStatusCode?: number } | undefined)
        ?.httpStatusCode
    : undefined;
}

function isConditionalConflict(error: unknown): boolean {
  return (
    ["PreconditionFailed", "ConditionalRequestConflict"].includes(
      errorName(error) ?? "",
    ) || [409, 412].includes(statusCode(error) ?? 0)
  );
}

const client = new S3Client({ maxAttempts: 1 });

export const handler = (event: unknown, context: LambdaContext) =>
  createDocumentValidationHandler(client, {
    bucket: process.env.DOCUMENT_VALIDATION_BUCKET ?? "",
    prefix: process.env.DOCUMENT_VALIDATION_PREFIX ?? "",
    maxBytes: Number(
      process.env.DOCUMENT_VALIDATION_MAX_BYTES ??
        v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES,
    ),
    kmsKeyId: process.env.DOCUMENT_VALIDATION_KMS_KEY_ID || undefined,
  })(event, context);
