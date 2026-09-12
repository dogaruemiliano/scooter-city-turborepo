import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from "@nestjs/common";
import { v1 } from "@repo/api-shared";
import { createHash } from "node:crypto";

import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";
import { PersonDocumentExtractionService } from "../person-document-extraction/person-document-extraction.service";
import { PersonsService } from "./persons.service";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 20 * 1024 * 1024;

@Injectable()
export class PersonDocumentAnalysisService {
  constructor(
    private readonly persons: PersonsService,
    private readonly storage: ImageStorageService,
    private readonly extraction: PersonDocumentExtractionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async analyze(
    input: v1.persons.AnalyzePersonDocumentInput,
    userId: string,
  ): Promise<v1.persons.PersonDocumentExtraction> {
    const sources: Array<{
      slot: v1.persons.PersonDocumentPhotoSlot;
      contentType: StoredDocument["contentType"];
      bytes: Uint8Array;
    }> = [];
    const sourceUploadIds: string[] = [];
    let totalBytes = 0;

    for (const slot of v1.persons.PERSON_DOCUMENT_PHOTO_SLOTS) {
      const token = input.photos[slot];
      if (!token) continue;
      const { draftUploadId, storedDocument } =
        await this.persons.resolveUsableDocumentDraft(token, userId);
      if (sourceUploadIds.includes(draftUploadId))
        throw new BadRequestException(
          "The same upload cannot be used in multiple slots",
        );
      if (
        storedDocument.contentType === "application/pdf" &&
        input.documentType !== "proofOfAddress"
      ) {
        throw new BadRequestException(
          "PDF uploads are only supported for proof of address",
        );
      }
      totalBytes += storedDocument.byteSize;
      if (
        storedDocument.byteSize >
          Math.min(this.env.IMAGE_STORAGE_MAX_BYTES, MAX_SOURCE_BYTES) ||
        totalBytes > MAX_TOTAL_SOURCE_BYTES
      ) {
        throw new PayloadTooLargeException(
          "Document extraction sources are too large",
        );
      }
      const bytes = await this.readSource(storedDocument);
      sources.push({ slot, contentType: storedDocument.contentType, bytes });
      sourceUploadIds.push(draftUploadId);
    }
    if (sources.length === 0)
      throw new BadRequestException(
        "At least one uploaded document is required",
      );

    try {
      const content = v1.persons.personDocumentExtractionContentSchema.parse(
        await this.extraction.analyze({
          documentType: input.documentType,
          nationalIdFormat: input.nationalIdFormat,
          sources,
        }),
      );
      const slots = new Set(sources.map((source) => source.slot));
      if (
        [...content.suggestions, ...content.licenseCategories].some(
          (suggestion) => !slots.has(suggestion.sourceSlot),
        )
      ) {
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_INVALID_SOURCE",
          "Invalid extraction source",
          false,
        );
      }
      return {
        ...content,
        documentType: input.documentType,
        sourceUploadIds,
        reviewRequired: true,
      };
    } catch (error) {
      const code =
        error instanceof DocumentExtractionError
          ? error.code
          : "DOCUMENT_EXTRACTION_FAILED";
      const status =
        code === "DOCUMENT_EXTRACTION_TOO_LARGE"
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : code === "DOCUMENT_EXTRACTION_THROTTLED"
            ? HttpStatus.TOO_MANY_REQUESTS
            : code === "DOCUMENT_EXTRACTION_DISABLED" ||
                code === "DOCUMENT_EXTRACTION_UNAVAILABLE" ||
                code === "DOCUMENT_EXTRACTION_ACCESS_DENIED"
              ? HttpStatus.SERVICE_UNAVAILABLE
              : code === "DOCUMENT_EXTRACTION_FAILED"
                ? HttpStatus.BAD_GATEWAY
                : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          code,
          message:
            "Document extraction could not be completed. You can enter the details manually.",
        },
        status,
      );
    }
  }

  private async readSource(source: StoredDocument): Promise<Uint8Array> {
    const stored = await this.storage.readDocument(source.storageKey);
    if (
      stored.contentType !== source.contentType ||
      (stored.contentLength !== null &&
        stored.contentLength !== source.byteSize)
    ) {
      stored.body.destroy();
      throw new BadRequestException(
        "Uploaded document does not match its metadata",
      );
    }
    const chunks: Buffer[] = [];
    let byteSize = 0;
    const checksum = createHash("sha256");
    for await (const chunk of stored.body) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      byteSize += bytes.length;
      if (byteSize > source.byteSize || byteSize > MAX_SOURCE_BYTES) {
        stored.body.destroy();
        throw new PayloadTooLargeException(
          "Document extraction source is too large",
        );
      }
      checksum.update(bytes);
      chunks.push(bytes);
    }
    if (
      byteSize !== source.byteSize ||
      checksum.digest("hex") !== source.checksumSha256
    ) {
      throw new BadRequestException(
        "Uploaded document does not match its checksum",
      );
    }
    return Buffer.concat(chunks, byteSize);
  }
}
