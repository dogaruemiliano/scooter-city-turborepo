"use client";

import {
  PencilIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  Trash2Icon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./dropdown-menu";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { DocumentZoom, type DocumentZoomLabels } from "./document-zoom";
import { PdfPreview, type PdfPreviewLabels } from "./pdf-preview";
import { cn } from "../lib/utils";

export function DocumentViewer({
  open,
  onOpenChange,
  src,
  contentType,
  fileName,
  title,
  imageAlt,
  closeLabel,
  openFileLabel,
  pdfLabels,
  zoomLabels,
  onChange,
  changeLabel,
  actionsLabel,
  onRemove,
  removeLabel,
  onSave,
  saveLabel,
  disabled,
  error,
  footer,
  navigation,
  review,
  reviewTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src?: string | null;
  contentType?: string;
  fileName?: string;
  title: string;
  imageAlt: string;
  closeLabel: string;
  openFileLabel: string;
  pdfLabels: PdfPreviewLabels;
  zoomLabels: DocumentZoomLabels;
  onChange?: () => void;
  changeLabel?: string;
  actionsLabel: string;
  onRemove?: () => void;
  removeLabel?: string;
  onSave?: () => void;
  saveLabel?: string;
  disabled?: boolean;
  error?: string | null;
  footer?: ReactNode;
  navigation?: ReactNode;
  /** Optional editor/comparison panel; domain state remains with the caller. */
  review?: ReactNode;
  reviewTitle?: string;
}) {
  const headerActions = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={actionsLabel}
            className="size-11 min-h-11 hover:bg-document-overlay"
          />
        }
      >
        <EllipsisVerticalIcon aria-hidden="true" className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto max-w-[calc(100vw-var(--spacing-4))]"
      >
        {onChange ? (
          <DropdownMenuItem disabled={disabled} onClick={onChange}>
            <PencilIcon aria-hidden="true" />
            {changeLabel}
          </DropdownMenuItem>
        ) : null}
        {onRemove ? (
          <DropdownMenuItem
            disabled={disabled}
            variant="destructive"
            onClick={onRemove}
          >
            <Trash2Icon aria-hidden="true" />
            {removeLabel}
          </DropdownMenuItem>
        ) : null}
        {src ? (
          <DropdownMenuItem
            render={<a href={src} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLinkIcon aria-hidden="true" />
            {openFileLabel}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const previewHeader = {
    onClosePress: () => onOpenChange(false),
    closeLabel,
    headerActions,
  };
  // A positioned Dialog supplies a full-screen sheet without swipe dismissal.
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        data-slot="document-viewer"
        className="inset-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-popover p-0 text-popover-foreground sm:max-w-none data-open:slide-in-from-bottom data-closed:slide-out-to-bottom"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-control",
              review &&
                src &&
                "h-(--container-document-review) shrink-0 flex-none lg:h-auto lg:flex-1",
            )}
            data-slot="document-viewer-body"
          >
            {src ? (
              contentType === "application/pdf" ? (
                <PdfPreview
                  key={src}
                  src={src}
                  label={fileName ?? imageAlt}
                  labels={pdfLabels}
                  zoomLabels={zoomLabels}
                  {...previewHeader}
                />
              ) : (
                <DocumentZoom
                  key={src}
                  labels={zoomLabels}
                  caption={fileName ?? title}
                  {...previewHeader}
                >
                  {() => (
                    <img
                      src={src}
                      alt={imageAlt}
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  )}
                </DocumentZoom>
              )
            ) : (
              <DocumentZoom
                labels={zoomLabels}
                caption={fileName ?? title}
                {...previewHeader}
              >
                {() => null}
              </DocumentZoom>
            )}
          </div>
          {review ? (
            <aside
              aria-label={reviewTitle}
              data-slot="document-review"
              className="flex shrink-0 flex-col gap-6 rounded-t-3xl border-t border-border bg-popover p-6 text-popover-foreground lg:w-96 lg:overflow-y-auto lg:rounded-none lg:border-t-0 lg:border-l"
            >
              <div
                aria-hidden="true"
                className="mx-auto h-1 w-12 shrink-0 rounded-full bg-muted-foreground/40 lg:hidden"
              />
              {reviewTitle ? (
                <h2 className="text-base font-semibold">{reviewTitle}</h2>
              ) : null}
              {review}
            </aside>
          ) : null}
        </div>
        {navigation || error || onSave || footer ? (
          <div className="flex shrink-0 flex-col gap-1 bg-popover px-2 pt-1 pb-[max(var(--spacing-2),env(safe-area-inset-bottom))] text-popover-foreground">
            {navigation}
            {error ? (
              <p role="alert" className="text-center text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {onSave ? (
              <Button
                type="button"
                onClick={onSave}
                disabled={disabled || !src}
                className="w-full"
              >
                {saveLabel}
              </Button>
            ) : null}
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
