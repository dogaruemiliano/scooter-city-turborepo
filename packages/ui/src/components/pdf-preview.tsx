"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  LoaderCircleIcon,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import {
  acquirePdf,
  getPdfThumbnail,
  rememberPdfThumbnail,
} from "../lib/pdf-document";
import { DocumentZoom, type DocumentZoomLabels } from "./document-zoom";
import { Button } from "./button";
import type { DocumentPreviewHeaderProps } from "./document-preview-header";

export type PdfPreviewLabels = {
  error: string;
  previousPage: string;
  nextPage: string;
};

/** Client-rendered PDFs also work in browsers without a built-in PDF viewer. */
export function PdfPreview({
  src,
  label,
  labels,
  thumbnail = false,
  zoomLabels,
  onClosePress,
  closeLabel,
  headerActions,
}: {
  src: string;
  label: string;
  labels: PdfPreviewLabels;
  thumbnail?: boolean;
  zoomLabels?: DocumentZoomLabels;
} & Omit<DocumentPreviewHeaderProps, "caption">) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    let disposed = false;
    const resource = acquirePdf(src);
    void resource.promise
      .then((document) => {
        if (!disposed) setPdf(document);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      resource.release();
    };
  }, [src]);
  const page = (scale = 1) => (
    <PdfPage
      key={pageNumber}
      pdf={pdf!}
      pageNumber={pageNumber}
      label={`${label} (${pageNumber}/${pdf!.numPages})`}
      thumbnail={thumbnail}
      errorLabel={labels.error}
      renderScale={scale}
    />
  );
  const navigation = pdf ? (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 min-h-11 hover:bg-document-overlay disabled:border-transparent disabled:bg-transparent"
        aria-label={labels.previousPage}
        disabled={pageNumber === 1}
        onClick={() => setPageNumber(pageNumber - 1)}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <span role="status" className="px-1 text-xs tabular-nums">
        {pageNumber} / {pdf.numPages}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 min-h-11 hover:bg-document-overlay disabled:border-transparent disabled:bg-transparent"
        aria-label={labels.nextPage}
        disabled={pageNumber === pdf.numPages}
        onClick={() => setPageNumber(pageNumber + 1)}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </>
  ) : null;
  const content = (scale = 1) =>
    failed ? (
      <span
        role="status"
        className="flex h-full items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground"
      >
        <FileTextIcon className="size-6 shrink-0" aria-hidden="true" />
        {labels.error}
      </span>
    ) : pdf ? (
      page(scale)
    ) : (
      <span
        aria-busy="true"
        className="flex h-full items-center justify-center p-4"
      >
        <LoaderCircleIcon
          className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
          aria-hidden="true"
        />
      </span>
    );
  return (
    <span
      className={
        thumbnail
          ? "absolute inset-0 block"
          : "flex min-h-0 w-full flex-1 flex-col"
      }
      data-slot="pdf-preview"
    >
      {!thumbnail && zoomLabels ? (
        <DocumentZoom
          resetKey={pageNumber}
          labels={zoomLabels}
          navigation={navigation}
          caption={label}
          onClosePress={onClosePress}
          closeLabel={closeLabel}
          headerActions={headerActions}
        >
          {content}
        </DocumentZoom>
      ) : (
        <>
          {content()}
          {!thumbnail && pdf && !failed ? (
            <span className="flex items-center justify-center">
              {navigation}
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  label,
  thumbnail,
  errorLabel,
  renderScale,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  label: string;
  thumbnail: boolean;
  errorLabel: string;
  renderScale: number;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const preview =
    !thumbnail && pageNumber === 1 ? getPdfThumbnail(pdf) : undefined;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setWidth(Math.round(container.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    let disposed = false;
    let task: RenderTask | undefined;
    void pdf
      .getPage(pageNumber)
      .then(async (page) => {
        if (disposed) return;
        const original = page.getViewport({ scale: 1 });
        // Limit raster density for memory use; displayed dimensions follow the container.
        const density = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({
          scale: Math.min(
            (width * density * renderScale) / original.width,
            Math.sqrt(16_000_000 / (original.width * original.height)),
          ),
        });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!disposed) {
          if (thumbnail && pageNumber === 1) rememberPdfThumbnail(pdf, canvas);
          setState("ready");
        }
      })
      .catch(() => {
        if (!disposed) setState("error");
      });
    return () => {
      disposed = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width, renderScale, thumbnail]);

  return (
    <span
      ref={containerRef}
      aria-busy={state === "loading"}
      className={
        thumbnail
          ? "relative block h-full w-full"
          : "relative block min-h-0 w-full flex-1"
      }
      data-slot="pdf-page"
    >
      {state === "loading" && preview ? (
        <img
          src={preview}
          alt=""
          aria-hidden="true"
          data-slot="pdf-instant-preview"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        data-rendered={state === "ready"}
        className={`absolute inset-0 h-full w-full object-contain ${state === "ready" ? "visible" : "invisible"}`}
      />
      {state !== "ready" && !(state === "loading" && preview) ? (
        <span className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
          {state === "error" ? (
            <span role="status">{errorLabel}</span>
          ) : (
            <LoaderCircleIcon
              className="size-6 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
        </span>
      ) : null}
    </span>
  );
}
