"use client";

import { FileTextIcon, LoaderCircleIcon } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  acquirePdf,
  getPdfThumbnail,
  rememberPdfThumbnail,
} from "../lib/pdf-document";
import {
  DocumentZoom,
  type DocumentZoomLabels,
  type MediaNavigationProps,
} from "./document-zoom";
import { MediaNavigation } from "./media-navigation";
import type { DocumentPreviewHeaderProps } from "./document-preview-header";

export type PdfPreviewLabels = {
  error: string;
  previousPage: string;
  nextPage: string;
  retry?: string;
  pagePosition?: (page: number, total: number) => string;
};

/** Client-rendered PDFs also work in browsers without a built-in PDF viewer. */
export function PdfPreview({
  src,
  label,
  labels,
  thumbnail = false,
  onAspectRatio,
  zoomLabels,
  onClosePress,
  closeLabel,
  headerActions,
  headerOverlay,
  bottomOverlay,
  onPrevious,
  onNext,
  leftActions,
  rightActions,
  collectionPosition,
  previousDocumentLabel,
  nextDocumentLabel,
  initialPage = "first",
  entryDirection,
  wheelGesture,
}: {
  bottomOverlay?: ReactNode;
  src: string;
  label: string;
  labels: PdfPreviewLabels;
  thumbnail?: boolean;
  /** Reports the displayed PDF page proportions for adaptive thumbnail cards. */
  onAspectRatio?: (ratio: number) => void;
  zoomLabels?: DocumentZoomLabels;
  initialPage?: "first" | "last";
  collectionPosition?: string;
  previousDocumentLabel?: string;
  nextDocumentLabel?: string;
} & Omit<DocumentPreviewHeaderProps, "caption"> &
  MediaNavigationProps) {
  const [pageDirection, setPageDirection] = useState<-1 | 1>();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    let disposed = false;
    const resource = acquirePdf(src);
    void resource.promise
      .then((document) => {
        if (!disposed) {
          setPdf(document);
          setPageNumber(initialPage === "last" ? document.numPages : 1);
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      resource.release();
    };
  }, [src, initialPage]);
  function previous() {
    if (pageNumber > 1) {
      setPageDirection(-1);
      setPageNumber(pageNumber - 1);
    } else onPrevious?.();
  }
  function next() {
    if (pdf && pageNumber < pdf.numPages) {
      setPageDirection(1);
      setPageNumber(pageNumber + 1);
    } else onNext?.();
  }
  const page = (scale = 1) => (
    <PdfPage
      key={pageNumber}
      pdf={pdf!}
      pageNumber={pageNumber}
      label={`${label} (${pageNumber}/${pdf!.numPages})`}
      thumbnail={thumbnail}
      errorLabel={labels.error}
      renderScale={scale}
      onAspectRatio={onAspectRatio}
    />
  );
  const canPrevious = pageNumber > 1 || Boolean(onPrevious);
  const canNext = Boolean(pdf && pageNumber < pdf.numPages) || Boolean(onNext);
  const navigation = (
    <MediaNavigation
      previous={canPrevious ? previous : undefined}
      next={canNext ? next : undefined}
      previousLabel={
        pageNumber === 1 && onPrevious
          ? (previousDocumentLabel ?? labels.previousPage)
          : labels.previousPage
      }
      nextLabel={
        (!pdf || pageNumber === pdf.numPages) && onNext
          ? (nextDocumentLabel ?? labels.nextPage)
          : labels.nextPage
      }
      position={
        pdf
          ? (labels.pagePosition?.(pageNumber, pdf.numPages) ??
            `${pageNumber} / ${pdf.numPages}`)
          : undefined
      }
    />
  );
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
          entryDirection={pageDirection ?? entryDirection}
          onPrevious={canPrevious ? previous : undefined}
          onNext={canNext ? next : undefined}
          leftActions={leftActions}
          rightActions={rightActions}
          resetKey={pageNumber}
          wheelGesture={wheelGesture}
          labels={zoomLabels}
          navigation={navigation}
          caption={label}
          captionStatus={collectionPosition}
          onClosePress={onClosePress}
          closeLabel={closeLabel}
          headerActions={headerActions}
          headerOverlay={headerOverlay}
          bottomOverlay={bottomOverlay}
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
  onAspectRatio,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  label: string;
  thumbnail: boolean;
  errorLabel: string;
  renderScale: number;
  onAspectRatio?: (ratio: number) => void;
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
        onAspectRatio?.(original.width / original.height);
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
  }, [pdf, pageNumber, width, renderScale, thumbnail, onAspectRatio]);

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
