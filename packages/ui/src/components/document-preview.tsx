"use client";

import { aspectRatio } from "@repo/theme";
import { CheckIcon, ImagePlusIcon, LoaderCircleIcon } from "lucide-react";
import type { DragEventHandler, ReactNode } from "react";
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
}: {
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
  emptyLabel?: string;
  uploaded?: boolean;
  status?: string;
  footer?: ReactNode;
  onDrop?: DragEventHandler<HTMLElement>;
}) {
  const isPdf = contentType === "application/pdf";
  return (
    <>
      <Button
        id={id}
        type="button"
        variant="outline"
        aria-label={triggerLabel}
        disabled={disabled}
        aria-busy={Boolean(status)}
        style={{ aspectRatio: aspectRatio.documentLandscape }}
        className={`group relative h-auto w-full overflow-hidden rounded-lg p-0 whitespace-normal md:h-auto ${dragging ? "border-primary bg-accent" : ""}`}
        onClick={() => (fileName ? onOpenChange(true) : onEmptyClick?.())}
      >
        {isPdf && src ? (
          <PdfPreview
            key={src}
            src={src}
            label={fileName ?? imageAlt}
            labels={pdfLabels}
            thumbnail
          />
        ) : src ? (
          // Local or authenticated document previews cannot use an image optimizer.
          <img
            src={src}
            alt={imageAlt}
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
        <span className="absolute top-2 left-2">
          <Badge variant={fileName ? "secondary" : "outline"}>
            {uploaded ? <CheckIcon aria-hidden="true" /> : null}
            {label}
          </Badge>
        </span>
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
      />
    </>
  );
}
