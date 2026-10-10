import { createCanvas } from "@napi-rs/canvas";
import { dirname, join, sep } from "node:path";
import { DocumentExtractionError } from "../document-extraction/document-extraction.errors";

const MAX_PAGES = 10;
const MAX_PAGE_PIXELS = 9_000_000;
const MAX_PAGE_DIMENSION = 4_000;
// Leaves room for base64 expansion and the schema under the request-size limit.
const MAX_COMBINED_BYTES = 32 * 1024 * 1024;

export interface ScooterDocumentDetailImage {
  page: number;
  region: string;
  bytes: Uint8Array;
}

/** In-memory views of the same source, with no OCR substitutions or sharpening. */
export async function renderScooterPdfDetails(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<ScooterDocumentDetailImage[]> {
  signal.throwIfAborted();
  const { getDocument, VerbosityLevel } =
    await import("pdfjs-dist/legacy/build/pdf.mjs");
  signal.throwIfAborted();
  const assets = dirname(require.resolve("pdfjs-dist/package.json"));
  const loading = getDocument({
    // PDF.js may transfer/detach its input buffer. Keep the original intact.
    data: Uint8Array.from(bytes),
    useSystemFonts: false,
    useWorkerFetch: false,
    cMapUrl: join(assets, "cmaps") + sep,
    cMapPacked: true,
    standardFontDataUrl: join(assets, "standard_fonts") + sep,
    wasmUrl: join(assets, "wasm") + sep,
    verbosity: VerbosityLevel.ERRORS,
  });
  const abort = () => void loading.destroy().catch(() => {});
  signal.addEventListener("abort", abort, { once: true });
  const images: ScooterDocumentDetailImage[] = [];
  let totalBytes = bytes.byteLength;
  try {
    const document = await loading.promise;
    signal.throwIfAborted();
    if (document.numPages < 1 || document.numPages > MAX_PAGES)
      throw new DocumentExtractionError(
        "DOCUMENT_EXTRACTION_TOO_MANY_PAGES",
        "Document extraction accepts up to ten pages.",
        false,
      );
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      signal.throwIfAborted();
      const page = await document.getPage(pageNumber);
      // getViewport applies the PDF page's rotation and crop box.
      const original = page.getViewport({ scale: 1 });
      const { width, height } = original;
      if (!(width > 0 && height > 0 && Number.isFinite(width * height)))
        throw new Error("Invalid PDF page dimensions");
      const scale = Math.min(
        300 / 72,
        Math.sqrt(MAX_PAGE_PIXELS / (width * height)),
        MAX_PAGE_DIMENSION / Math.max(width, height),
      );
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(
        Math.max(1, Math.floor(viewport.width)),
        Math.max(1, Math.floor(viewport.height)),
      );
      const rendering = page.render({
        // PDF.js's types describe browser canvases; its Node renderer uses
        // this same @napi-rs/canvas implementation.
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: canvas.getContext(
          "2d",
        ) as unknown as CanvasRenderingContext2D,
        viewport,
      });
      const cancelRender = () => rendering.cancel();
      signal.addEventListener("abort", cancelRender, { once: true });
      try {
        signal.throwIfAborted();
        await rendering.promise;
        for (const crop of detailRegions(canvas.width, canvas.height)) {
          signal.throwIfAborted();
          const detail = createCanvas(crop.width, crop.height);
          try {
            detail
              .getContext("2d")
              .drawImage(
                canvas,
                crop.x,
                crop.y,
                crop.width,
                crop.height,
                0,
                0,
                crop.width,
                crop.height,
              );
            const image = await detail.encode("jpeg", 95);
            signal.throwIfAborted();
            totalBytes += image.byteLength;
            if (totalBytes > MAX_COMBINED_BYTES)
              throw new DocumentExtractionError(
                "DOCUMENT_EXTRACTION_TOO_LARGE",
                "The document's detailed views exceed the analysis size limit.",
                false,
              );
            images.push({ page: pageNumber, region: crop.name, bytes: image });
          } finally {
            detail.width = detail.height = 1;
          }
        }
      } finally {
        signal.removeEventListener("abort", cancelRender);
        canvas.width = canvas.height = 1;
        page.cleanup();
      }
    }
    return images;
  } finally {
    signal.removeEventListener("abort", abort);
    await loading.destroy();
  }
}

/** Twenty percent overlap keeps lines near the centre of a page intact. */
export function detailRegions(width: number, height: number) {
  const cropWidth = Math.ceil(width * 0.6);
  const cropHeight = Math.ceil(height * 0.6);
  return [
    { name: "top left", x: 0, y: 0 },
    { name: "top right", x: width - cropWidth, y: 0 },
    { name: "bottom left", x: 0, y: height - cropHeight },
    { name: "bottom right", x: width - cropWidth, y: height - cropHeight },
  ].map((region) => ({ ...region, width: cropWidth, height: cropHeight }));
}
