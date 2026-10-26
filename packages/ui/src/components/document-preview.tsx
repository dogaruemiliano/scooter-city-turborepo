"use client";

import { aspectRatio, softFade } from "@repo/theme";
import { CheckIcon, ImagePlusIcon, LoaderCircleIcon } from "lucide-react";
import {
  useCallback,
  useState,
  type DragEventHandler,
  type ReactNode,
} from "react";
import { PdfPreview, type PdfPreviewLabels } from "./pdf-preview";
import { Badge } from "./badge";
import { Button } from "./button";
import { DocumentViewer } from "./document-viewer";
import type { DocumentZoomLabels } from "./document-zoom";

/** Shared person/vehicle document card, with an accessible full-screen viewer. */
export function DocumentPreview({
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
  /** Portrait paper cards keep interactive overlays outside the preview button. */
  layout?: "landscape" | "paper";
  headerOverlay?: ReactNode;
  /** Fullscreen header may replace the card remove action with viewer dismissal. */
  viewerHeaderOverlay?: ReactNode;
  bottomOverlay?: ReactNode;
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
  const isPdf = contentType === "application/pdf";
  const [measured, setMeasured] = useState<{
    src: typeof src;
    ratio: number;
  }>();
  const measureRatio = useCallback(
    (ratio: number) => {
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      setMeasured((previous) =>
        previous && previous.src === src && previous.ratio === ratio
          ? previous
          : { src, ratio },
      );
    },
    [src],
  );
  const paperRatio = Math.max(
    aspectRatio.documentA4Portrait,
    measured && measured.src === src
      ? measured.ratio
      : aspectRatio.documentA4Portrait,
  );
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
      onClick={() => (fileName ? onOpenChange(true) : onEmptyClick?.())}
    >
      {isPdf && src ? (
        <PdfPreview
          key={src}
          src={src}
          label={fileName ?? imageAlt}
          labels={pdfLabels}
          thumbnail
          onAspectRatio={layout === "paper" ? measureRatio : undefined}
        />
      ) : src ? (
        // Local or authenticated document previews cannot use an image optimizer.
        <img
          src={src}
          alt={imageAlt}
          onLoad={
            layout === "paper"
              ? (event) =>
                  measureRatio(
                    event.currentTarget.naturalWidth /
                      event.currentTarget.naturalHeight,
                  )
              : undefined
          }
          className="absolute inset-0 h-full w-full object-contain"
        />
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
          style={{ aspectRatio: paperRatio }}
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
