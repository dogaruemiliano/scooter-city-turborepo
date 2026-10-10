import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
} from "pdf-lib";
import { PDFDocument as EncryptedPDFDocument } from "@cantoo/pdf-lib";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";
import {
  readScooterDocumentSource,
  SCOOTER_DOCUMENT_READ_TIMEOUT_MS,
} from "./scooter-document-source-reader";

const MAX_BYTES = 10 * 1024 * 1024;
async function pdfBytes(pages = 2, encrypted = false) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage();
  if (encrypted)
    pdf.context.trailerInfo.Encrypt = pdf.context.obj({ Filter: "Standard" });
  return Buffer.from(await pdf.save({ addDefaultPage: false }));
}

async function protectedPdfBytes(
  userPassword = "",
  pages = 2,
  algorithm: "RC4-128" | "AES-128" | "AES-256" = "RC4-128",
) {
  const pdf = await EncryptedPDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Synthetic insurance policy, page ${i + 1}`, { size: 5 });
  }
  pdf.encrypt({
    userPassword,
    ownerPassword: "synthetic-owner-password",
    permissions: { printing: "highResolution" },
    algorithm,
    allowWeakCryptography: true, // Reproduce older insurer PDFs in tests only.
  });
  return Buffer.from(await pdf.save({ addDefaultPage: false }));
}

function setup(
  bytes: Buffer,
  contentType: StoredDocument["contentType"] = "application/pdf",
) {
  const source: StoredDocument = {
    provider: "s3",
    bucket: "private",
    storageKey: "documents/test.pdf",
    contentType,
    byteSize: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    imageWidth: null,
    imageHeight: null,
    pageCount: null,
  };
  const body = Readable.from([bytes]);
  const storage = {
    readDocument: jest
      .fn()
      .mockResolvedValue({ body, contentType, contentLength: bytes.length }),
  };
  const read = (signal?: AbortSignal, limit = MAX_BYTES) =>
    readScooterDocumentSource(
      storage as unknown as ImageStorageService,
      source,
      limit,
      signal,
    );
  return { source, storage, body, read };
}

describe("scooter document original-byte reading", () => {
  afterEach(() => jest.useRealTimers());

  it("returns every byte of a multi-page PDF, ignoring untrusted page metadata", async () => {
    const bytes = await pdfBytes(3);
    const { source, read } = setup(bytes);
    source.pageCount = 1;
    await expect(read()).resolves.toEqual(bytes);
  });

  it.each([0, 11])(
    "rejects a PDF with %i pages before it reaches the provider",
    async (pages) => {
      const { read } = setup(await pdfBytes(pages));
      await expect(read()).rejects.toMatchObject({
        code:
          pages === 0
            ? "DOCUMENT_EXTRACTION_BAD_DOCUMENT"
            : "DOCUMENT_EXTRACTION_TOO_MANY_PAGES",
      });
    },
  );

  it.each(["RC4-128", "AES-128", "AES-256"] as const)(
    "accepts %s PDFs that open without a password and preserves every page",
    async (algorithm) => {
      const bytes = await protectedPdfBytes("", 2, algorithm);
      const before = Buffer.from(bytes);
      const normalized = await setup(bytes).read();
      const pdf = await PDFDocument.load(normalized, {
        throwOnInvalidObject: true,
        updateMetadata: false,
      });
      expect(pdf.isEncrypted).toBe(false);
      expect(pdf.getPageCount()).toBe(2);
      expect(pdf.getPages().map((page) => page.getSize())).toEqual([
        { width: 595, height: 842 },
        { width: 595, height: 842 },
      ]);
      for (const [index, page] of pdf.getPages().entries()) {
        const contents = page.node.Contents();
        expect(contents).toBeInstanceOf(PDFArray);
        const text = (contents as PDFArray)
          .asArray()
          .map((ref) => {
            const stream = pdf.context.lookup(ref);
            if (!(stream instanceof PDFRawStream))
              throw new Error("Expected a PDF content stream");
            return Buffer.from(decodePDFRawStream(stream).decode()).toString();
          })
          .join("\n");
        expect(text).toContain(
          Buffer.from(`Synthetic insurance policy, page ${index + 1}`)
            .toString("hex")
            .toUpperCase(),
        );
      }
      expect(bytes).toEqual(before);
    },
  );

  it.each(["RC4-128", "AES-128", "AES-256"] as const)(
    "rejects %s PDFs that actually require an opening password",
    async (algorithm) => {
      await expect(
        setup(
          await protectedPdfBytes("synthetic-reader-password", 2, algorithm),
        ).read(),
      ).rejects.toMatchObject({
        code: "DOCUMENT_EXTRACTION_ENCRYPTED_DOCUMENT",
      });
    },
  );

  it("bounds the prepared PDF as well as the original upload", async () => {
    const bytes = await protectedPdfBytes();
    const { read } = setup(bytes);
    const save = jest
      .spyOn(EncryptedPDFDocument.prototype, "save")
      .mockResolvedValueOnce(new Uint8Array(bytes.length + 1));
    try {
      await expect(read(undefined, bytes.length)).rejects.toMatchObject({
        code: "DOCUMENT_EXTRACTION_TOO_LARGE",
      });
    } finally {
      save.mockRestore();
    }
  });

  it("enforces the page limit after decrypting a passwordless PDF", async () => {
    await expect(
      setup(await protectedPdfBytes("", 11)).read(),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_TOO_MANY_PAGES",
    });
  });

  it("rejects corrupt PDFs and invalid encryption dictionaries", async () => {
    await expect(setup(await pdfBytes(1, true)).read()).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
    });
    await expect(
      setup(Buffer.from("%PDF-invalid")).read(),
    ).rejects.toMatchObject({ code: "DOCUMENT_EXTRACTION_BAD_DOCUMENT" });
  });

  it("checks original byte signatures instead of trusting a claimed MIME type", async () => {
    await expect(
      setup(Buffer.from("<html>not a PDF</html>")).read(),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
    });
    await expect(
      setup(Buffer.from("%PDF-not an image"), "image/png").read(),
    ).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
    });
  });

  it.each([
    ["image/png", "89504e470d0a1a0a00000000"],
    ["image/jpeg", "ffd8ffe00000"],
    ["image/webp", "524946460000000057454250"],
  ] as const)(
    "accepts the supported %s image signature",
    async (contentType, hex) => {
      const bytes = Buffer.from(hex, "hex");
      await expect(setup(bytes, contentType).read()).resolves.toEqual(bytes);
    },
  );

  it("rejects a checksum mismatch, truncated data, or metadata mismatch and closes the stream", async () => {
    const bytes = await pdfBytes();
    const altered = setup(bytes);
    altered.source.checksumSha256 = "0".repeat(64);
    await expect(altered.read()).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_INVALID_SOURCE",
    });
    const truncated = setup(bytes);
    truncated.storage.readDocument.mockResolvedValue({
      body: truncated.body,
      contentType: "application/pdf",
      contentLength: null,
    });
    truncated.source.byteSize++;
    await expect(truncated.read()).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_INVALID_SOURCE",
    });
    const wrongType = setup(bytes);
    wrongType.storage.readDocument.mockResolvedValue({
      body: wrongType.body,
      contentType: "image/png",
      contentLength: bytes.length,
    });
    await expect(wrongType.read()).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_INVALID_SOURCE",
    });
    expect(wrongType.body.destroyed).toBe(true);
  });

  it("enforces configured and streamed size limits", async () => {
    const bytes = await pdfBytes();
    const beforeReading = setup(bytes);
    await expect(beforeReading.read(undefined, 10)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_TOO_LARGE",
    });
    expect(beforeReading.storage.readDocument).not.toHaveBeenCalled();
    const streaming = setup(bytes);
    streaming.storage.readDocument.mockResolvedValue({
      body: Readable.from([bytes, bytes]),
      contentType: "application/pdf",
      contentLength: null,
    });
    await expect(streaming.read()).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_TOO_LARGE",
    });
  });

  it("bounds a stalled storage request and destroys a late arriving body", async () => {
    const { storage, read, body, source } = setup(await pdfBytes());
    let resolve!: (value: unknown) => void;
    storage.readDocument.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    jest.useFakeTimers();
    const pending = read();
    const rejected = expect(pending).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_TIMEOUT",
    });
    await jest.advanceTimersByTimeAsync(SCOOTER_DOCUMENT_READ_TIMEOUT_MS);
    await rejected;
    resolve({
      body,
      contentType: source.contentType,
      contentLength: source.byteSize,
    });
    await Promise.resolve();
    expect(body.destroyed).toBe(true);
    expect(storage.readDocument).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ aborted: true }),
    );
  });

  it("bounds a stalled stream and handles caller cancellation", async () => {
    const stalled = setup(await pdfBytes());
    const body = new Readable({ read() {} });
    stalled.storage.readDocument.mockResolvedValue({
      body,
      contentType: "application/pdf",
      contentLength: null,
    });
    jest.useFakeTimers();
    const rejected = expect(stalled.read()).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_TIMEOUT",
    });
    await jest.advanceTimersByTimeAsync(SCOOTER_DOCUMENT_READ_TIMEOUT_MS);
    await rejected;
    expect(body.destroyed).toBe(true);
    jest.useRealTimers();
    const canceled = setup(await pdfBytes());
    const controller = new AbortController();
    controller.abort();
    await expect(canceled.read(controller.signal)).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_UNAVAILABLE",
    });
    expect(canceled.storage.readDocument).not.toHaveBeenCalled();
  });

  it("sanitizes storage failures", async () => {
    const { read, storage } = setup(await pdfBytes());
    storage.readDocument.mockRejectedValue(new Error("sensitive storage key"));
    await expect(read()).rejects.toMatchObject({
      code: "DOCUMENT_EXTRACTION_READ_FAILED",
      message: "Document could not be read.",
    });
  });
});
