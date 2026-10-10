import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { ImageStorageService } from "../image-storage/image-storage.service";
import { ScooterDocumentExtractionService } from "../scooter-document-extraction/scooter-document-extraction.service";
import { ScooterDocumentsService } from "./scooter-documents.service";
import { readScooterDocumentSource } from "./scooter-document-source-reader";

@Injectable()
export class ScooterDocumentAnalysisService {
  // This bounds paid in-flight work per API process; the endpoint also has rate limiting.
  private activeCount = 0;
  private readonly activeByUser = new Map<string, number>();

  constructor(
    private readonly documents: ScooterDocumentsService,
    private readonly storage: ImageStorageService,
    private readonly extraction: ScooterDocumentExtractionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async analyze(
    input: v1.scooters.AnalyzeScooterDocumentInput,
    userId: string,
    signal?: AbortSignal,
  ): Promise<v1.scooters.ScooterDocumentAnalysis> {
    const activeForUser = this.activeByUser.get(userId) ?? 0;
    if (this.activeCount >= 4 || activeForUser >= 2)
      throw extractionHttpError(
        new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_THROTTLED",
          "Too many active extractions.",
          true,
        ),
      );
    this.activeCount++;
    this.activeByUser.set(userId, activeForUser + 1);
    try {
      if (signal?.aborted)
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_UNAVAILABLE",
          "Extraction was interrupted.",
          true,
        );
      let source: Awaited<
        ReturnType<ScooterDocumentsService["resolveAnalysisSource"]>
      >;
      try {
        source = await this.documents.resolveAnalysisSource(
          input.source,
          userId,
        );
      } catch {
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_INVALID_SOURCE",
          "Document is not available for extraction.",
          false,
        );
      }
      if (source.stored.bucket !== this.env.IMAGE_STORAGE_S3_BUCKET)
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_INVALID_SOURCE",
          "Document storage does not match.",
          false,
        );
      const bytes = await readScooterDocumentSource(
        this.storage,
        source.stored,
        this.env.IMAGE_STORAGE_MAX_BYTES,
        signal,
      );
      const result = await this.extraction.analyze({
        documentType: source.documentType,
        bytes,
        contentType: source.stored.contentType,
        signal,
      });
      return v1.scooters.scooterDocumentAnalysisSchema.parse({
        ...result,
        sourceId: input.sourceId,
        documentType: source.documentType,
        reviewRequired: true,
      });
    } catch (error) {
      throw extractionHttpError(error);
    } finally {
      this.activeCount--;
      const remaining = (this.activeByUser.get(userId) ?? 1) - 1;
      if (remaining) this.activeByUser.set(userId, remaining);
      else this.activeByUser.delete(userId);
    }
  }
}

function extractionHttpError(error: unknown): HttpException {
  const code =
    error instanceof DocumentExtractionError
      ? error.code
      : "DOCUMENT_EXTRACTION_FAILED";
  const status =
    code === "DOCUMENT_EXTRACTION_THROTTLED"
      ? HttpStatus.TOO_MANY_REQUESTS
      : code === "DOCUMENT_EXTRACTION_TOO_LARGE" ||
          code === "DOCUMENT_EXTRACTION_TOO_MANY_PAGES"
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : code === "DOCUMENT_EXTRACTION_TIMEOUT"
          ? HttpStatus.GATEWAY_TIMEOUT
          : [
                "DOCUMENT_EXTRACTION_DISABLED",
                "DOCUMENT_EXTRACTION_UNAVAILABLE",
                "DOCUMENT_EXTRACTION_READ_FAILED",
                "DOCUMENT_EXTRACTION_ACCESS_DENIED",
              ].includes(code)
            ? HttpStatus.SERVICE_UNAVAILABLE
            : code === "DOCUMENT_EXTRACTION_FAILED"
              ? HttpStatus.BAD_GATEWAY
              : HttpStatus.BAD_REQUEST;
  return new HttpException(
    {
      code,
      message:
        "Document extraction could not be completed. You can enter the details manually.",
    },
    status,
  );
}
