import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { PDFDocument } from "pdf-lib";
import { PDFDocument as CompatiblePDFDocument } from "@cantoo/pdf-lib";
import { v1 } from "@repo/api-shared";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";
import type { ImageStorageService } from "../image-storage/image-storage.service";
import type { StoredDocument } from "../image-storage/image-storage.types";

export const SCOOTER_DOCUMENT_READ_TIMEOUT_MS = 15_000;
export const SCOOTER_DOCUMENT_MAX_PAGES =
  v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_MAX_PAGES;

/** Verify originals, preparing a lossless analysis copy only for passwordless encrypted PDFs. */
export async function readScooterDocumentSource(
  storage: Pick<ImageStorageService, "readDocument">,
  source: StoredDocument,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const limit = Math.min(maxBytes, v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES);
  if (source.byteSize > limit)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_LARGE",
      "Document is too large.",
      false,
    );
  if (source.byteSize <= 0)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
      "Document is empty.",
      false,
    );
  const controller = new AbortController();
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  let body: Readable | undefined;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SCOOTER_DOCUMENT_READ_TIMEOUT_MS);
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => {
      body?.destroy();
      reject(
        new DocumentExtractionError(
          timedOut
            ? "DOCUMENT_EXTRACTION_TIMEOUT"
            : "DOCUMENT_EXTRACTION_UNAVAILABLE",
          "Document reading was interrupted.",
          true,
        ),
      );
    };
    combinedSignal.addEventListener("abort", abort, { once: true });
    if (combinedSignal.aborted) abort();
  });
  const read = async () => {
    combinedSignal.throwIfAborted();
    const stored = await storage.readDocument(
      source.storageKey,
      combinedSignal,
    );
    body = stored.body;
    if (combinedSignal.aborted) {
      body.destroy();
      combinedSignal.throwIfAborted();
    }
    if (
      stored.contentType !== source.contentType ||
      (stored.contentLength !== null &&
        stored.contentLength !== source.byteSize)
    )
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_INVALID_SOURCE",
        "Document metadata does not match.",
        false,
      );
    const chunks: Buffer[] = [];
    let size = 0;
    const checksum = createHash("sha256");
    for await (const chunk of body) {
      combinedSignal.throwIfAborted();
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > source.byteSize || size > limit)
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_TOO_LARGE",
          "Document is too large.",
          false,
        );
      checksum.update(bytes);
      chunks.push(bytes);
    }
    if (
      size !== source.byteSize ||
      checksum.digest("hex") !== source.checksumSha256
    )
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_INVALID_SOURCE",
        "Document checksum does not match.",
        false,
      );
    const bytes = Buffer.concat(chunks, size);
    const prepared = await prepareDocumentBytes(
      bytes,
      source.contentType,
      limit,
      combinedSignal,
    );
    combinedSignal.throwIfAborted();
    return prepared;
  };
  try {
    return await Promise.race([read(), aborted]);
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    if (combinedSignal.aborted)
      throw new DocumentExtractionError(
        timedOut
          ? "DOCUMENT_EXTRACTION_TIMEOUT"
          : "DOCUMENT_EXTRACTION_UNAVAILABLE",
        "Document reading was interrupted.",
        true,
      );
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_READ_FAILED",
      "Document could not be read.",
      true,
    );
  } finally {
    clearTimeout(timer);
    if (abort) combinedSignal.removeEventListener("abort", abort);
    body?.destroy();
  }
}

export async function prepareDocumentBytes(
  bytes: Buffer,
  contentType: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const matches =
    contentType === "application/pdf"
      ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
      : contentType === "image/jpeg"
        ? bytes.length >= 3 &&
          bytes[0] === 0xff &&
          bytes[1] === 0xd8 &&
          bytes[2] === 0xff
        : contentType === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : contentType === "image/webp"
            ? bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
              bytes.subarray(8, 12).toString("ascii") === "WEBP"
            : false;
  if (!matches)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_UNSUPPORTED_DOCUMENT",
      "Document format does not match its media type.",
      false,
    );
  if (contentType !== "application/pdf") return bytes;
  try {
    const pdf = await PDFDocument.load(bytes, {
      // Keep ordinary PDFs byte-for-byte; pdf-lib cannot decrypt encrypted objects.
      ignoreEncryption: true,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (!pdf.isEncrypted) {
      validatePageCount(pdf.getPageCount());
      return bytes;
    }
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    // Encrypted object streams can fail before pdf-lib reaches its encryption
    // flag. Try a reader that decrypts them before declaring the PDF corrupt.
  }
  signal.throwIfAborted();
  try {
    const pdf = await CompatiblePDFDocument.load(bytes, {
      password: "",
      updateMetadata: false,
    });
    signal.throwIfAborted();
    // Only recover files successfully opened with the empty password. Do not
    // turn this into a tolerant parser for arbitrary corrupt, unencrypted PDFs.
    if (!pdf.context.isDecrypted || pdf.isEncrypted) throw new Error();
    const pageCount = pdf.getPageCount();
    validatePageCount(pageCount);

    // Copy complete page objects (text, vectors, images and annotations), without
    // rasterizing or changing their resolution. A fresh container avoids carrying
    // over stale encrypted cross-reference streams. The stored original stays intact.
    const normalized = await CompatiblePDFDocument.create({
      updateMetadata: false,
    });
    const pages = await normalized.copyPages(pdf, pdf.getPageIndices());
    signal.throwIfAborted();
    for (const page of pages) normalized.addPage(page);
    const prepared = Buffer.from(
      await normalized.save({
        addDefaultPage: false,
        updateFieldAppearances: false,
      }),
    );
    signal.throwIfAborted();
    if (prepared.length > maxBytes)
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_TOO_LARGE",
        "Prepared document is too large.",
        false,
      );
    const verified = await PDFDocument.load(prepared, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (verified.isEncrypted || verified.getPageCount() !== pageCount)
      throw new Error();
    return prepared;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DocumentExtractionError) throw error;
    // These are the parser's fixed password errors; never expose its raw errors.
    if (
      error instanceof Error &&
      ["NEEDS PASSWORD", "Password incorrect"].includes(error.message)
    )
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_ENCRYPTED_DOCUMENT",
        "PDF requires an opening password.",
        false,
      );
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
      "PDF cannot be read.",
      false,
    );
  }
}

function validatePageCount(pages: number) {
  if (pages === 0)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
      "PDF has no pages.",
      false,
    );
  if (pages > SCOOTER_DOCUMENT_MAX_PAGES)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_MANY_PAGES",
      "PDF has too many pages.",
      false,
    );
}
