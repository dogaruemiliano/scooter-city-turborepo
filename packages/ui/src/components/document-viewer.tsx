"use client";

import {
  PencilIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./dropdown-menu";
import { Button } from "./button";
import { MediaViewer } from "./media-viewer";
import { DocumentZoom, type DocumentZoomLabels } from "./document-zoom";
import { PdfPreview, type PdfPreviewLabels } from "./pdf-preview";
import type { MediaNavigationProps } from "./document-zoom";

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
  headerOverlay,
  bottomOverlay,
  navigation,
  review,
  reviewTitle,
  onPrevious,
  onNext,
  initialPdfPage,
  leftActions,
  rightActions,
  entryDirection: requestedEntryDirection,
}: {
  headerOverlay?: ReactNode;
  bottomOverlay?: ReactNode;
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
  initialPdfPage?: "first" | "last";
} & MediaNavigationProps) {
  const [entryDirection, setEntryDirection] = useState<-1 | 1>();
  const previous = onPrevious
    ? () => {
        setEntryDirection(-1);
        onPrevious();
      }
    : undefined;
  const next = onNext
    ? () => {
        setEntryDirection(1);
        onNext();
      }
    : undefined;
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
    leftActions,
    rightActions,
    headerOverlay,
    bottomOverlay,
    onPrevious: previous,
    onNext: next,
    entryDirection: requestedEntryDirection ?? entryDirection,
  };
  // A positioned Dialog supplies a full-screen sheet without swipe dismissal.
  return (
    <MediaViewer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      slot="document-viewer"
      hasSource={Boolean(src)}
      review={review}
      reviewTitle={reviewTitle}
      navigation={navigation}
      error={error}
      onSave={onSave}
      saveLabel={saveLabel}
      disabled={disabled}
      footer={footer}
    >
      {src ? (
        contentType === "application/pdf" ? (
          <PdfPreview
            key={src}
            src={src}
            initialPage={initialPdfPage}
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
    </MediaViewer>
  );
}
