"use client";

import { aspectRatio, softFade } from "@repo/theme";
import { CheckIcon, ImagePlusIcon, LoaderCircleIcon } from "lucide-react";
import { type DragEventHandler, type ReactNode } from "react";
import { PdfPreview, type PdfPreviewLabels } from "./pdf-preview";
import { Badge } from "./badge";
import { Button } from "./button";
import { DocumentViewer } from "./document-viewer";
import { useMediaCollection } from "./media-collection";
import type { DocumentZoomLabels } from "./document-zoom";
import { DocumentPreviewBackdrop } from "./document-preview-backdrop";

/** Shared person/vehicle document card, with an accessible full-screen viewer. */
export function DocumentPreview({
  mediaId,
  id,
  src,
  contentType,
  fileName,
  label,
  triggerLabel,
  imageAlt,
  title,
  closeLabel,
  openFileLabel,
  actionsLabel,
  pdfLabels,
  zoomLabels,
  open,
  onOpenChange,
  onEmptyClick,
  disabled,
  dragging,
  emptyLabel,
  uploaded,
  status,
  footer,
  countLabel,
  layout = "landscape",
  headerOverlay,
  viewerHeaderOverlay,
  bottomOverlay,
}: {
  /** Fixed A4 portrait cards contain the document over a blurred copy. */
  layout?: "landscape" | "paper";
  headerOverlay?: ReactNode;
  /** Fullscreen header may replace the card remove action with viewer dismissal. */
  viewerHeaderOverlay?: ReactNode;
  bottomOverlay?: ReactNode;
  mediaId?: string;
  id?: string;
  src?: string | null;
  contentType?: string;
  fileName?: string;
  label: string;
  triggerLabel: string;
  imageAlt: string;
  title: string;
  closeLabel: string;
  openFileLabel: string;
  actionsLabel: string;
  pdfLabels: PdfPreviewLabels;
  zoomLabels: DocumentZoomLabels;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmptyClick?: () => void;
  disabled?: boolean;
  dragging?: boolean;
  emptyLabel?: ReactNode;
  uploaded?: boolean;
  status?: string;
  footer?: ReactNode;
  countLabel?: string;
  onDrop?: DragEventHandler<HTMLElement>;
}) {
  const collection = useMediaCollection();
  const isPdf = contentType === "application/pdf";
  const preview = (
    <Button
      id={id}
      type="button"
      variant={layout === "paper" ? "ghost" : "outline"}
      aria-label={triggerLabel}
      disabled={disabled}
      aria-busy={Boolean(status)}
      style={
        layout === "landscape"
          ? { aspectRatio: aspectRatio.documentLandscape }
          : undefined
      }
      className={`group ${layout === "paper" ? "absolute inset-0 h-full w-full rounded-none md:h-full" : "relative h-auto w-full rounded-lg md:h-auto"} overflow-hidden p-0 whitespace-normal ${dragging ? "border-primary bg-accent" : ""}`}
      onClick={() => {
        if (fileName) {
          if (!collection?.open(mediaId ?? src)) onOpenChange(true);
        } else onEmptyClick?.();
      }}
    >
      {isPdf && src ? (
        <PdfPreview
          key={src}
          src={src}
          label={fileName ?? imageAlt}
          labels={pdfLabels}
          thumbnail
          thumbnailBackdrop={layout === "paper"}
        />
      ) : src ? (
        <>
          {layout === "paper" ? <DocumentPreviewBackdrop src={src} /> : null}
          {/* Local or authenticated previews cannot use an image optimizer. */}
          <img
            src={src}
            alt={imageAlt}
            className="absolute inset-0 h-full w-full object-contain object-center"
          />
        </>
      ) : (
        <span className="flex flex-col items-center gap-2 px-3 text-center">
          <ImagePlusIcon
            className="size-8 text-muted-foreground group-hover:text-foreground"
            aria-hidden="true"
          />
          {emptyLabel ? (
            <span className="text-sm font-medium">{emptyLabel}</span>
          ) : null}
        </span>
      )}
      {layout === "landscape" ? (
        <span className="absolute top-2 left-2">
          <Badge variant={fileName ? "secondary" : "outline"}>
            {uploaded ? <CheckIcon aria-hidden="true" /> : null}
            {label}
          </Badge>
        </span>
      ) : null}
      {countLabel ? (
        <span className="absolute bottom-2 left-2">
          <Badge variant="secondary">{countLabel}</Badge>
        </span>
      ) : null}
      {status ? (
        <span
          role="status"
          data-slot="document-upload-overlay"
          className="pointer-events-none absolute right-0 bottom-0 flex size-16 items-end justify-end bg-linear-to-tl from-media-scrim via-transparent to-transparent p-3 text-scrim-foreground"
        >
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-5 animate-spin motion-reduce:animate-none"
          />
          <span className="sr-only">{status}</span>
        </span>
      ) : null}
    </Button>
  );
  return (
    <>
      {layout === "paper" ? (
        <div
          data-slot="document-preview-card"
          style={{ aspectRatio: aspectRatio.documentA4Portrait }}
          className="relative isolate min-w-0 overflow-hidden rounded-xl border border-border bg-control"
        >
          {preview}
          {headerOverlay ? (
            <div
              style={{ backgroundImage: softFade.toTop }}
              className="pointer-events-none absolute inset-x-0 top-0 flex min-w-0 items-start justify-between gap-2 p-1.5 pb-6 text-scrim-foreground *:pointer-events-auto"
            >
              {headerOverlay}
            </div>
          ) : null}
          {bottomOverlay ? (
            <div
              style={{ backgroundImage: softFade.toBottom }}
              className="pointer-events-none absolute inset-x-0 bottom-0 flex min-w-0 items-center justify-between gap-2 p-1.5 pt-6 text-scrim-foreground *:pointer-events-auto"
            >
              {bottomOverlay}
            </div>
          ) : null}
        </div>
      ) : (
        preview
      )}
      <DocumentViewer
        open={open}
        onOpenChange={onOpenChange}
        src={src}
        contentType={contentType}
        fileName={fileName}
        title={title}
        imageAlt={imageAlt}
        closeLabel={closeLabel}
        openFileLabel={openFileLabel}
        actionsLabel={actionsLabel}
        pdfLabels={pdfLabels}
        zoomLabels={zoomLabels}
        footer={footer}
        headerOverlay={viewerHeaderOverlay}
        bottomOverlay={bottomOverlay}
      />
    </>
  );
}
