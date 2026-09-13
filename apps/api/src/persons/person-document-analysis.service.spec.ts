import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { v1 } from "@repo/api-shared";

import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import { PersonDocumentAnalysisService } from "./person-document-analysis.service";

function createFixture(
  options: {
    body?: Buffer;
    byteSize?: number;
    checksum?: string;
    contentType?: string;
    sameUpload?: boolean;
  } = {},
) {
  const body = options.body ?? Buffer.from("document");
  const contentType = options.contentType ?? "image/png";
  const persons = {
    resolveUsableDocumentDraft: jest.fn((token: string, userId: string) => {
      void userId;
      return Promise.resolve({
        draftUploadId: options.sameUpload ? "one-upload" : `upload-${token}`,
        storedDocument: {
          provider: "s3",
          bucket: "private",
          storageKey: `${token}.png`,
          contentType,
          byteSize: options.byteSize ?? body.length,
          checksumSha256:
            options.checksum ?? createHash("sha256").update(body).digest("hex"),
          imageWidth: null,
          imageHeight: null,
          pageCount: null,
        },
      });
    }),
  };
  const storage = {
    readDocument: jest.fn(() =>
      Promise.resolve({
        body: Readable.from([body]),
        contentType,
        contentLength: null,
      }),
    ),
  };
  const content: v1.persons.PersonDocumentExtractionContent = {
    detectedDocumentType: "nationalId",
    suggestions: [
      {
        target: "person",
        field: "firstName",
        value: "Ștefan",
        sourceSlot: "front",
        needsReview: false,
      },
    ],
    licenseCategories: [],
    warnings: [],
  };
  const extraction = { analyze: jest.fn().mockResolvedValue(content) };
  const service = new PersonDocumentAnalysisService(
    persons as never,
    storage as never,
    extraction as never,
    { IMAGE_STORAGE_MAX_BYTES: 10 * 1024 * 1024 } as never,
  );
  return { service, persons, storage, extraction };
}

const input: v1.persons.AnalyzePersonDocumentInput = {
  documentType: "nationalId",
  nationalIdFormat: "classic",
  photos: { front: "front-token" },
};

describe("PersonDocumentAnalysisService", () => {
  it("returns suggestions with trusted source IDs without claiming or saving records", async () => {
    const { service, persons, extraction } = createFixture();
    const result = await service.analyze(input, "owner");
    expect(result).toMatchObject({
      documentType: "nationalId",
      sourceUploadIds: ["upload-front-token"],
      reviewRequired: true,
      suggestions: [
        {
          target: "person",
          field: "firstName",
          value: "Ștefan",
          sourceSlot: "front",
          needsReview: false,
        },
      ],
    });
    expect(persons.resolveUsableDocumentDraft).toHaveBeenCalledWith(
      "front-token",
      "owner",
    );
    expect(extraction.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          {
            slot: "front",
            contentType: "image/png",
            bytes: Buffer.from("document"),
          },
        ],
      }),
    );
  });

  it("does not call the provider for invalid ownership, duplicate sources, or empty inputs", async () => {
    const fixture = createFixture();
    fixture.persons.resolveUsableDocumentDraft.mockRejectedValueOnce(
      new BadRequestException("owner mismatch"),
    );
    await expect(
      fixture.service.analyze(input, "other"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      fixture.service.analyze({ ...input, photos: {} }, "owner"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.extraction.analyze).not.toHaveBeenCalled();
    const duplicate = createFixture({ sameUpload: true });
    await expect(
      duplicate.service.analyze(
        { ...input, photos: { front: "one", back: "two" } },
        "owner",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(duplicate.extraction.analyze).not.toHaveBeenCalled();
  });

  it("checks the actual source checksum and accepts identity PDFs", async () => {
    const checksum = createFixture({ checksum: "0".repeat(64) });
    await expect(checksum.service.analyze(input, "owner")).rejects.toThrow(
      "checksum",
    );
    expect(checksum.extraction.analyze).not.toHaveBeenCalled();
    const pdf = createFixture({ contentType: "application/pdf" });
    await pdf.service.analyze(input, "owner");
    expect(pdf.storage.readDocument).toHaveBeenCalledTimes(1);
    expect(pdf.extraction.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.objectContaining({ contentType: "application/pdf" })],
      }),
    );
  });

  it("bounds declared, streamed, and total document bytes before provider calls", async () => {
    const declared = createFixture({ byteSize: 11 * 1024 * 1024 });
    await expect(
      declared.service.analyze(input, "owner"),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(declared.storage.readDocument).not.toHaveBeenCalled();
    const streamed = createFixture({ byteSize: 1 });
    await expect(
      streamed.service.analyze(input, "owner"),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(streamed.extraction.analyze).not.toHaveBeenCalled();
    const total = createFixture({ body: Buffer.alloc(8 * 1024 * 1024) });
    await expect(
      total.service.analyze(
        { ...input, photos: { front: "front", back: "back", other: "other" } },
        "owner",
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(total.storage.readDocument).toHaveBeenCalledTimes(2);
    expect(total.extraction.analyze).not.toHaveBeenCalled();
  });

  it("rejects fabricated source provenance and hides provider error contents", async () => {
    const fixture = createFixture();
    fixture.extraction.analyze.mockResolvedValueOnce({
      detectedDocumentType: "nationalId",
      suggestions: [
        {
          target: "person",
          field: "firstName",
          value: "Ștefan",
          sourceSlot: "back",
          needsReview: true,
        },
      ],
      licenseCategories: [],
      warnings: [],
    });
    await expect(fixture.service.analyze(input, "owner")).rejects.toMatchObject(
      {
        status: 400,
        response: {
          code: "DOCUMENT_EXTRACTION_INVALID_SOURCE",
        },
      },
    );
    fixture.extraction.analyze.mockRejectedValueOnce(
      new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_UNAVAILABLE",
        "private provider payload",
        true,
      ),
    );
    try {
      await fixture.service.analyze(input, "owner");
      throw new Error("Expected extraction failure");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(503);
      expect(
        JSON.stringify((error as HttpException).getResponse()),
      ).not.toContain("private provider payload");
    }
  });
});
