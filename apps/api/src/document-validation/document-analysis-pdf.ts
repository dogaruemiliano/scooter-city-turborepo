import { degrees, PDFDocument } from "pdf-lib";
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
