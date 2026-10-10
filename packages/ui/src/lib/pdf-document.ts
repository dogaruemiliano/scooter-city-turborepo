import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf } from "./pdf";

type Entry = {
  users: number;
  promise: Promise<PDFDocumentProxy>;
  task?: PDFDocumentLoadingTask;
  document?: PDFDocumentProxy;
};

// Share parsing and the worker between the card and viewer. Nothing survives
// the last mounted consumer, so private documents are not retained globally.
const documents = new Map<string, Entry>();
const thumbnails = new WeakMap<PDFDocumentProxy, string>();

export function acquirePdf(src: string) {
  let entry = documents.get(src);
  if (!entry) {
    const next: Entry = {
      users: 0,
      promise: loadPdf().then(async ({ getDocument }) => {
        if (!next.users) throw new Error("Document preview closed");
        next.task = getDocument({ url: src, withCredentials: true });
        next.document = await next.task.promise;
        return next.document;
      }),
    };
    entry = next;
    documents.set(src, entry);
  }
  entry.users++;
  const current = entry;
  let released = false;
  return {
    promise: current.promise,
    release() {
      if (released) return;
      released = true;
      current.users--;
      if (!current.users) {
        documents.delete(src);
        if (current.document) thumbnails.delete(current.document);
        void current.task?.destroy().catch(() => {});
      }
    },
  };
}

export function getPdfThumbnail(pdf: PDFDocumentProxy) {
  return thumbnails.get(pdf);
}

export function rememberPdfThumbnail(
  pdf: PDFDocumentProxy,
  canvas: HTMLCanvasElement,
) {
  try {
    thumbnails.set(pdf, canvas.toDataURL("image/jpeg", 0.8));
  } catch {
    // Snapshot failure must not stop the actual PDF from rendering.
  }
}
