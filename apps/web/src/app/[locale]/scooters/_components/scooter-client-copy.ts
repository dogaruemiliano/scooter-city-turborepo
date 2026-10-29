import { v1 } from "@repo/api-shared";
import { opacity } from "@repo/theme";
import { loadPdf } from "@repo/ui/lib/pdf";

/** Cover the entire document without independently stretching either image axis. */
export function overlayCoverRect(
  width: number,
  height: number,
  overlayWidth: number,
  overlayHeight: number,
) {
  const scale = Math.max(width / overlayWidth, height / overlayHeight);
  return {
    x: (width - overlayWidth * scale) / 2,
    y: (height - overlayHeight * scale) / 2,
    width: overlayWidth * scale,
    height: overlayHeight * scale,
  };
}
function paintOverlay(canvas: HTMLCanvasElement, overlay: ImageBitmap) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const rect = overlayCoverRect(
    canvas.width,
    canvas.height,
    overlay.width,
    overlay.height,
  );
  // Apply 10% opacity while preserving the PNG's alpha and logo proportions.
  context.save();
  try {
    context.globalAlpha = opacity.clientDocumentOverlay;
    context.drawImage(overlay, rect.x, rect.y, rect.width, rect.height);
  } finally {
    context.restore();
  }
}
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Document export failed")),
      "image/png",
    ),
  );
}
/** Rasterize the protected client copy; the uploaded original remains untouched. */
export async function generateScooterClientCopy(file: File): Promise<File> {
  const response = await fetch("/images/asset-protection-overlay.png");
  if (!response.ok) throw new Error("Protection overlay unavailable");
  const overlay = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  try {
    let output: Blob;
    let extension: string;
    if (file.type === "application/pdf") {
      const [{ PDFDocument }, { getDocument }] = await Promise.all([
        import("pdf-lib"),
        loadPdf(),
      ]);
      const task = getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      });
      try {
        const source = await task.promise;
        if (source.numPages > v1.scooters.SCOOTER_DOCUMENT_EXTRACTION_MAX_PAGES)
          throw new Error("Too many PDF pages");
        const target = await PDFDocument.create();
        for (let index = 1; index <= source.numPages; index++) {
          const page = await source.getPage(index);
          const original = page.getViewport({ scale: 1 });
          // Technical rasterization limits: 144 DPI, bounded to nine million pixels.
          const scale = Math.min(
            2,
            Math.sqrt(9_000_000 / (original.width * original.height)),
          );
          const viewport = page.getViewport({ scale });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          paintOverlay(canvas, overlay);
          const image = await target.embedPng(
            await (await png(canvas)).arrayBuffer(),
          );
          target.addPage([original.width, original.height]).drawImage(image, {
            x: 0,
            y: 0,
            width: original.width,
            height: original.height,
          });
          page.cleanup();
        }
        output = new Blob([new Uint8Array(await target.save())], {
          type: "application/pdf",
        });
        extension = "pdf";
      } finally {
        await task.destroy();
      }
    } else {
      const original = await createImageBitmap(file);
      try {
        const scale = Math.min(
          1,
          Math.sqrt(9_000_000 / (original.width * original.height)),
        );
        canvas.width = Math.max(1, Math.round(original.width * scale));
        canvas.height = Math.max(1, Math.round(original.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(original, 0, 0, canvas.width, canvas.height);
        paintOverlay(canvas, overlay);
        output = await png(canvas);
        extension = "png";
      } finally {
        original.close();
      }
    }
    if (output.size > v1.scooters.SCOOTER_DOCUMENT_MAX_BYTES)
      throw new Error("Client copy exceeds the document upload limit");
    return new File(
      [output],
      `${file.name.replace(/\.[^.]+$/, "").slice(0, 240)}-client.${extension}`,
      { type: output.type },
    );
  } finally {
    overlay.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
