import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { v1 } from "@repo/api-shared";
import type { Env } from "../config/env";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { ScooterDocumentExtractionService } from "../scooter-document-extraction/scooter-document-extraction.service";
import type { ScooterDocumentsService } from "./scooter-documents.service";
import { ScooterDocumentAnalysisService } from "./scooter-document-analysis.service";

const input: v1.scooters.AnalyzeScooterDocumentInput = {
  sourceId: "draft-source-id",
  source: { kind: "draft", type: "civ", uploadToken: "signed-token" },
};
const result = {
  extractedData: {
    vin: "L5YAUCZB9H1148984",
    fields: { powerKw: 1.8 },
    rawFields: { "P.2": "1,8" },
  },
  issues: [],
};
function setup() {
  const bytes = Buffer.from("ffd8ffe00000", "hex");
  const source = {
    documentType: "civ",
    stored: {
      provider: "s3",
      bucket: "private",
      storageKey: "documents/test.jpg",
      contentType: "image/jpeg",
      byteSize: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
  const documents = {
    resolveAnalysisSource: jest.fn().mockResolvedValue(source),
  };
  const storage = {
    readDocument: jest.fn().mockImplementation(() =>
      Promise.resolve({
        body: Readable.from([bytes]),
        contentType: "image/jpeg",
        contentLength: bytes.length,
      }),
    ),
  };
  const extraction = { analyze: jest.fn().mockResolvedValue(result) };
  const service = new ScooterDocumentAnalysisService(
    documents as unknown as ScooterDocumentsService,
    storage as unknown as ImageStorageService,
    extraction as unknown as ScooterDocumentExtractionService,
    {
      IMAGE_STORAGE_MAX_BYTES: 10 * 1024 * 1024,
      IMAGE_STORAGE_S3_BUCKET: "private",
    } as Env,
  );
  return { service, documents, storage, extraction, source, bytes };
}

describe("ScooterDocumentAnalysisService", () => {
  it("binds returned identity to the request and resolved type, always requiring review", async () => {
    const { service, documents, extraction, bytes } = setup();
    extraction.analyze.mockResolvedValue({
      ...result,
      sourceId: "model-chosen",
      documentType: "insurance",
      reviewRequired: false,
    });
    await expect(service.analyze(input, "admin")).resolves.toEqual({
      ...result,
      sourceId: input.sourceId,
      documentType: "civ",
      reviewRequired: true,
    });
    expect(documents.resolveAnalysisSource).toHaveBeenCalledWith(
      input.source,
      "admin",
    );
    expect(extraction.analyze).toHaveBeenCalledWith({
      documentType: "civ",
      bytes,
      contentType: "image/jpeg",
      signal: undefined,
    });
  });

  it("never reads storage or calls AI for unavailable sources", async () => {
    const { service, documents, storage, extraction } = setup();
    documents.resolveAnalysisSource.mockRejectedValue(
      new Error("private data"),
    );
    await expect(service.analyze(input, "admin")).rejects.toMatchObject({
      status: 400,
      response: { code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" },
    });
    expect(storage.readDocument).not.toHaveBeenCalled();
    expect(extraction.analyze).not.toHaveBeenCalled();
  });

  it("rejects a source from a different bucket before reading", async () => {
    const { service, source, storage } = setup();
    source.stored.bucket = "other-bucket";
    await expect(service.analyze(input, "admin")).rejects.toMatchObject({
      response: { code: "DOCUMENT_EXTRACTION_INVALID_SOURCE" },
    });
    expect(storage.readDocument).not.toHaveBeenCalled();
  });

  it.each([
    ["DOCUMENT_EXTRACTION_DISABLED", 503],
    ["DOCUMENT_EXTRACTION_TIMEOUT", 504],
    ["DOCUMENT_EXTRACTION_THROTTLED", 429],
    ["DOCUMENT_EXTRACTION_BAD_DOCUMENT", 400],
    ["DOCUMENT_EXTRACTION_TOO_MANY_PAGES", 413],
    ["DOCUMENT_EXTRACTION_FAILED", 502],
  ] as const)(
    "maps %s without exposing provider output",
    async (code, status) => {
      const { service, extraction } = setup();
      extraction.analyze.mockRejectedValue(
        new DocumentExtractionError(code, "private provider output", false),
      );
      await expect(service.analyze(input, "admin")).rejects.toMatchObject({
        status,
        response: {
          code,
          message:
            "Document extraction could not be completed. You can enter the details manually.",
        },
      });
    },
  );

  it("validates provider output and releases concurrency on failure", async () => {
    const { service, extraction } = setup();
    extraction.analyze.mockResolvedValue({
      extractedData: { unexpected: true },
    });
    for (let i = 0; i < 3; i++)
      await expect(service.analyze(input, "admin")).rejects.toMatchObject({
        response: { code: "DOCUMENT_EXTRACTION_FAILED" },
      });
  });

  it("bounds concurrent work per user and per process, then frees every slot", async () => {
    const { service, extraction } = setup();
    let release!: (value: typeof result) => void;
    const pendingResult = new Promise((resolve) => {
      release = resolve;
    });
    extraction.analyze.mockImplementation(() => pendingResult);
    const pending = [
      service.analyze(input, "admin"),
      service.analyze(input, "admin"),
    ];
    await expect(service.analyze(input, "admin")).rejects.toMatchObject({
      status: 429,
    });
    pending.push(
      service.analyze(input, "other"),
      service.analyze(input, "other"),
    );
    await expect(service.analyze(input, "third")).rejects.toMatchObject({
      status: 429,
    });
    release(result);
    await Promise.all(pending);
    await expect(service.analyze(input, "third")).resolves.toMatchObject({
      reviewRequired: true,
    });
  });

  it("propagates caller cancellation and does no work for an already closed request", async () => {
    const { service, extraction, documents } = setup();
    const controller = new AbortController();
    await service.analyze(input, "admin", controller.signal);
    expect(extraction.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
    documents.resolveAnalysisSource.mockClear();
    controller.abort();
    await expect(
      service.analyze(input, "admin", controller.signal),
    ).rejects.toMatchObject({
      response: { code: "DOCUMENT_EXTRACTION_UNAVAILABLE" },
    });
    expect(documents.resolveAnalysisSource).not.toHaveBeenCalled();
  });
});
