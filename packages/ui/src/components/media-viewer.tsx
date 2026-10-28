"use client";

import {
  PencilIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  Trash2Icon,
  Grid3X3Icon,
  CropIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode, type ComponentProps } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./dropdown-menu";
import { Button } from "./button";
import { MediaViewerSurface } from "./media-viewer-surface";
import { ImagePreview, type ImagePreviewProps } from "./image-preview";
import { ImageEditor, type ImageEditorLabels } from "./image-editor";
import { MediaNavigation } from "./media-navigation";
import { useObjectUrl } from "../hooks/use-object-url";
import { DocumentZoom, type DocumentZoomLabels } from "./document-zoom";
import { PdfPreview, type PdfPreviewLabels } from "./pdf-preview";
import type { MediaNavigationProps } from "./document-zoom";

export type MediaItem = {
  id: string;
  src?: string | null;
  file?: File;
  contentType: string;
  fileName: string;
  alt?: string;
};

/** One viewer for a caller-owned list. DocumentViewer/ImageViewer are adapters only. */
function MediaViewerSession({
  embedded = false,
  file,
  items,
  activeId,
  onActiveIdChange,
  collectionLabels,
  imageLabels,
  gridLabel,
  swipeDismiss = false,
  onCrop,
  cropLabel,
  editorLabels,
  slot = "media-viewer",
  saving,
  pendingLabel,
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
  embedded?: boolean;
  file?: File;
  items?: readonly MediaItem[];
  activeId?: string | null;
  onActiveIdChange?: (id: string) => void;
  collectionLabels?: {
    previous: string;
    next: string;
    position: (index: number, total: number) => string;
  };
  imageLabels?: Pick<
    ImagePreviewProps,
    "loadingLabel" | "errorLabel" | "retryLabel"
  >;
  gridLabel?: string;
  swipeDismiss?: boolean;
  onCrop?: (file: File) => void | Promise<void>;
  cropLabel?: string;
  editorLabels?: Partial<ImageEditorLabels>;
  slot?: string;
  saving?: boolean;
  pendingLabel?: string;
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
  const viewer = useRef<HTMLDivElement>(null);
  const wheelGesture = useRef({
    last: -Infinity,
    distance: 0,
    committed: false,
  });
  const [entryDirection, setEntryDirection] = useState<-1 | 1>();
  const [initialPage, setInitialPage] = useState<"first" | "last">("first");
  const [grid, setGrid] = useState(false);
  const [cropLoading, setCropLoading] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const [editing, setEditing] = useState<File | null>(null);
  const index = items?.findIndex((item) => item.id === activeId) ?? -1;
  const item = items?.[index];
  const localSrc = useObjectUrl(open ? (item?.file ?? null) : null);
  src = item ? (item.src ?? localSrc) : src;
  contentType = item?.contentType ?? contentType;
  fileName = item?.fileName ?? fileName;
  imageAlt = item?.alt ?? item?.fileName ?? imageAlt;
  file = item?.file ?? file;
  const canCrop = ["image/jpeg", "image/png", "image/webp"].includes(
    contentType ?? "",
  );
  const isImage = !contentType || contentType.startsWith("image/");
  function move(direction: -1 | 1) {
    if (cropLoading || saving) return;
    setEntryDirection(direction);
    setInitialPage(direction < 0 ? "last" : "first");
    const target = items?.[index + direction];
    if (target) onActiveIdChange?.(target.id);
    else (direction < 0 ? onPrevious : onNext)?.();
  }
  const previous = (items ? index > 0 : onPrevious)
    ? () => move(-1)
    : undefined;
  const next = (items ? index >= 0 && index < items.length - 1 : onNext)
    ? () => move(1)
    : undefined;
  const position =
    items && collectionLabels
      ? collectionLabels.position(index + 1, items.length)
      : undefined;
  const collectionNavigation =
    items && collectionLabels ? (
      <MediaNavigation
        previous={previous}
        next={next}
        previousLabel={collectionLabels.previous}
        nextLabel={collectionLabels.next}
      />
    ) : undefined;
  const headerActions = (
    <>
      {gridLabel && isImage ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={gridLabel}
          aria-pressed={grid}
          onClick={() => setGrid(!grid)}
        >
          <Grid3X3Icon aria-hidden="true" />
        </Button>
      ) : null}
      {actionsLabel &&
      (onChange || onRemove || onCrop || (src && openFileLabel)) ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={actionsLabel}
                disabled={disabled || cropLoading}
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
            {canCrop && onCrop ? (
              <DropdownMenuItem
                disabled={disabled || cropLoading}
                onClick={async () => {
                  setCropError(null);
                  if (file) {
                    setEditing(file);
                    return;
                  }
                  if (!src || cropLoading) return;
                  setCropLoading(true);
                  try {
                    const response = await fetch(src, {
                      credentials: "include",
                    });
                    if (!response.ok) throw new Error(pdfLabels.error);
                    const blob = await response.blob();
                    setEditing(
                      new File([blob], fileName ?? title, {
                        type: contentType,
                      }),
                    );
                  } catch {
                    setCropError(pdfLabels.error);
                  } finally {
                    setCropLoading(false);
                  }
                }}
              >
                <CropIcon aria-hidden="true" />
                {cropLabel}
              </DropdownMenuItem>
            ) : null}
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
      ) : null}
    </>
  );
  const previewHeader = {
    captionStatus: position,
    onClosePress: embedded
      ? undefined
      : () => {
          if (!cropLoading && !saving) onOpenChange(false);
        },
    closeLabel,
    headerActions,
    leftActions,
    rightActions,
    headerOverlay,
    bottomOverlay,
    onPrevious: previous,
    onNext: next,
    entryDirection: requestedEntryDirection ?? entryDirection,
    onSwipeDown: swipeDismiss ? () => onOpenChange(false) : undefined,
    swipeDownTarget: viewer,
    wheelGesture,
  };
  // A positioned Dialog supplies a full-screen sheet without swipe dismissal.
  if (editing && onCrop)
    return (
      <ImageEditor
        file={editing}
        labels={editorLabels}
        onCancel={() => setEditing(null)}
        onSave={async (file) => {
          await onCrop(file);
          setEditing(null);
        }}
      />
    );
  const content = open ? (
    <>
      {src ? (
        contentType === "application/pdf" ? (
          <PdfPreview
            key={src}
            src={src}
            initialPage={initialPdfPage ?? initialPage}
            collectionPosition={position}
            previousDocumentLabel={collectionLabels?.previous}
            nextDocumentLabel={collectionLabels?.next}
            label={fileName ?? imageAlt}
            labels={pdfLabels}
            zoomLabels={zoomLabels}
            {...previewHeader}
          />
        ) : isImage ? (
          <DocumentZoom
            key={src}
            labels={zoomLabels}
            caption={fileName ?? title}
            navigation={collectionNavigation}
            {...previewHeader}
          >
            {() => (
              <ImagePreview
                src={src}
                alt={imageAlt}
                grid={grid}
                loadingLabel={imageLabels?.loadingLabel ?? fileName ?? title}
                errorLabel={imageLabels?.errorLabel ?? pdfLabels.error}
                retryLabel={
                  imageLabels?.retryLabel ?? pdfLabels.retry ?? openFileLabel
                }
              />
            )}
          </DocumentZoom>
        ) : (
          <DocumentZoom
            key={src}
            labels={zoomLabels}
            caption={fileName ?? title}
            navigation={collectionNavigation}
            {...previewHeader}
          >
            {() => (
              <div
                role="status"
                className="flex flex-1 items-center justify-center p-4"
              >
                {pdfLabels.error}
              </div>
            )}
          </DocumentZoom>
        )
      ) : (
        <DocumentZoom
          labels={zoomLabels}
          caption={fileName ?? title}
          navigation={collectionNavigation}
          {...previewHeader}
        >
          {() => null}
        </DocumentZoom>
      )}
    </>
  ) : null;
  if (embedded) return content;
  return (
    <MediaViewerSurface
      open={open && (!items || Boolean(item))}
      onOpenChange={(value) => {
        if (!cropLoading && !saving) onOpenChange(value);
      }}
      title={title}
      slot={slot}
      contentRef={viewer}
      saving={saving}
      pendingLabel={pendingLabel}
      hasSource={Boolean(src)}
      review={review}
      reviewTitle={reviewTitle}
      navigation={navigation}
      error={cropError ?? error}
      onSave={onSave}
      saveLabel={saveLabel}
      disabled={disabled || cropLoading}
      footer={footer}
    >
      {content}
    </MediaViewerSurface>
  );
}

export type MediaViewerProps = ComponentProps<typeof MediaViewerSession>;

/** Closing a session releases sources, crop state and PDF navigation together. */
export function MediaViewer(props: MediaViewerProps) {
  return props.open ? <MediaViewerSession {...props} /> : null;
}
