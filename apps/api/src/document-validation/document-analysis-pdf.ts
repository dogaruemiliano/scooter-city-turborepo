import { degrees, PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";

/** Bake scanner rotation into the analysis copy, without resampling image pixels.
 * Some PDF consumers clip rotated landscape pages to the portrait MediaBox.
 * Originals remain untouched. Annotation-bearing PDFs retain their appearances.
 */
export async function normalizeDocumentAnalysisPdf(
  bytes: Buffer,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  signal.throwIfAborted();
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = source.getPages();
  if (
    !pages.some((page) => page.getRotation().angle % 360 !== 0) ||
    pages.some((page) => (page.node.Annots()?.size() ?? 0) > 0)
  )
    return bytes;
  const output = await PDFDocument.create({ updateMetadata: false });
  for (const page of pages) {
    signal.throwIfAborted();
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const left = Math.max(media.x, crop.x);
    const bottom = Math.max(media.y, crop.y);
    const right = Math.min(media.x + media.width, crop.x + crop.width);
    const top = Math.min(media.y + media.height, crop.y + crop.height);
    const width = right - left;
    const height = top - bottom;
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (
      ![0, 90, 180, 270].includes(rotation) ||
      !Number.isFinite(width * height) ||
      width <= 0 ||
      height <= 0
    )
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
        "Invalid PDF page geometry.",
        false,
      );
    const sideways = rotation === 90 || rotation === 270;
    const target = output.addPage(sideways ? [height, width] : [width, height]);
    if (page.node.Contents()) {
      const embedded = await output.embedPage(page, {
        left,
        bottom,
        right,
        top,
      });
      target.drawPage(embedded, {
        x: rotation === 180 ? width : rotation === 270 ? height : 0,
        y: rotation === 90 ? width : rotation === 180 ? height : 0,
        rotate: degrees(-rotation),
      });
    }
  }
  const prepared = Buffer.from(await output.save({ addDefaultPage: false }));
  signal.throwIfAborted();
  if (prepared.length > maxBytes)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_LARGE",
      "Prepared document is too large.",
      false,
    );
  return prepared;
}

/** Opt-in native detail views. Each source stream is embedded once and reused;
 * there is no image resampling, OCR replacement, or mutation of the upload.
 * The full original-page sequence comes first and keeps its one-based map.
 */
export async function appendDocumentAnalysisDetails(
  bytes: Buffer,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  signal.throwIfAborted();
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = source.getPages();
  if (!pages.length || pages.length > 10)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_MANY_PAGES",
      "Document extraction accepts up to ten original pages.",
      false,
    );
  // Appearance streams and sideways metadata must remain intact. Call the
  // rotation normalizer first; annotation-bearing files retain their original.
  if (
    pages.some(
      (page) =>
        (page.node.Annots()?.size() ?? 0) > 0 ||
        page.getRotation().angle % 360 !== 0,
    )
  )
    return bytes;
  const output = await PDFDocument.create({ updateMetadata: false });
  const font = await output.embedFont(StandardFonts.Helvetica);
  const embedded = await Promise.all(
    pages.map(async (page) => {
      signal.throwIfAborted();
      const media = page.getMediaBox();
      const crop = page.getCropBox();
      const left = Math.max(media.x, crop.x);
      const bottom = Math.max(media.y, crop.y);
      const right = Math.min(media.x + media.width, crop.x + crop.width);
      const top = Math.min(media.y + media.height, crop.y + crop.height);
      if (
        !(
          right > left &&
          top > bottom &&
          Number.isFinite((right - left) * (top - bottom))
        )
      )
        throw new DocumentExtractionError(
          "DOCUMENT_EXTRACTION_BAD_DOCUMENT",
          "Invalid PDF page geometry.",
          false,
        );
      return {
        width: right - left,
        height: top - bottom,
        page: page.node.Contents()
          ? await output.embedPage(page, { left, bottom, right, top })
          : null,
      };
    }),
  );
  for (const original of embedded) {
    signal.throwIfAborted();
    const page = output.addPage([original.width, original.height]);
    if (original.page) page.drawPage(original.page);
  }
  for (const [index, original] of embedded.entries()) {
    if (!original.page) continue;
    const width = original.width * 0.6;
    const height = original.height * 0.6;
    for (const [name, x, y] of [
      ["top left", 0, original.height - height],
      ["top right", original.width - width, original.height - height],
      ["bottom left", 0, 0],
      ["bottom right", original.width - width, 0],
    ] as const) {
      signal.throwIfAborted();
      const header = 24;
      const page = output.addPage([width, height + header]);
      page.drawPage(original.page, { x: -x, y: -y });
      // Mask overscan behind the header while preserving the entire region.
      page.drawRectangle({
        x: 0,
        y: height,
        width,
        height: header,
        color: rgb(1, 1, 1),
      });
      page.drawText(
        `ANALYSIS DETAIL - original source page ${index + 1}, ${name}`,
        {
          x: 4,
          y: height + 8,
          size: Math.min(8, width / 65),
          font,
          color: rgb(0, 0, 0),
        },
      );
    }
  }
  const prepared = Buffer.from(await output.save({ addDefaultPage: false }));
  signal.throwIfAborted();
  if (prepared.length > maxBytes)
    throw new DocumentExtractionError(
      "DOCUMENT_EXTRACTION_TOO_LARGE",
      "The document's detailed views exceed the analysis size limit.",
      false,
    );
  return prepared;
}
