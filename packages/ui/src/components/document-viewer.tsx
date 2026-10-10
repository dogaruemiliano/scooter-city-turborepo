"use client";

import {
  PencilIcon,
  XIcon,
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
}) {
  // A positioned Dialog supplies a full-screen sheet without swipe dismissal.
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        data-slot="document-viewer"
        className="inset-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-popover p-0 text-popover-foreground sm:max-w-none data-open:slide-in-from-bottom data-closed:slide-out-to-bottom"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-1 pt-[env(safe-area-inset-top)]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            onClick={() => onOpenChange(false)}
          >
            <XIcon aria-hidden="true" className="size-6" />
          </Button>
          <DialogTitle className="min-w-0 flex-1 truncate text-center text-sm">
            {title}
          </DialogTitle>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={actionsLabel}
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
                  render={
                    <a href={src} target="_blank" rel="noopener noreferrer" />
                  }
                >
                  <ExternalLinkIcon aria-hidden="true" />
                  {openFileLabel}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
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
              />
            ) : (
              <DocumentZoom key={src} labels={zoomLabels}>
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
          ) : null}
        </div>
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
      </DialogContent>
    </Dialog>
  );
}
