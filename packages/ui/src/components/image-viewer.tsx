"use client";

import { useRef, useState, type ReactNode } from "react";
import { Grid3X3Icon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { MediaViewer } from "./media-viewer";
import { DocumentZoom, type DocumentZoomLabels } from "./document-zoom";
import { ImagePreview } from "./image-preview";
import { Button } from "./button";

export type ViewerImage = {
  id: string;
  src: string;
  alt: string;
  fileName?: string;
};
export type ImageViewerLabels = DocumentZoomLabels & {
  close: string;
  previous: string;
  next: string;
  grid: string;
  loading: string;
  error: string;
  retry: string;
  position: (index: number, count: number) => string;
};

/** Controlled collection viewer; callers own ordering and item actions. */
export function ImageViewer({
  open,
  onOpenChange,
  images,
  activeId,
  onActiveIdChange,
  title,
  labels,
  leftActions,
  rightActions,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: readonly ViewerImage[];
  activeId: string | null;
  onActiveIdChange: (id: string) => void;
  title: string;
  labels: ImageViewerLabels;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  footer?: ReactNode;
}) {
  const viewer = useRef<HTMLDivElement>(null);
  const [entryDirection, setEntryDirection] = useState<-1 | 1>();
  const [grid, setGrid] = useState(false);
  const index = images.findIndex((image) => image.id === activeId);
  const image = images[index];
  function move(id: string, direction: -1 | 1) {
    setEntryDirection(direction);
    onActiveIdChange(id);
  }
  const previous =
    index > 0 ? () => move(images[index - 1]!.id, -1) : undefined;
  const next =
    index >= 0 && index < images.length - 1
      ? () => move(images[index + 1]!.id, 1)
      : undefined;
  return (
    <MediaViewer
      open={open && Boolean(image)}
      onOpenChange={onOpenChange}
      title={title}
      hasSource={Boolean(image)}
      slot="image-viewer"
      contentRef={viewer}
      footer={footer}
    >
      {image ? (
        <DocumentZoom
          key={image.id}
          entryDirection={entryDirection}
          labels={labels}
          caption={image.fileName ?? image.alt}
          onClosePress={() => onOpenChange(false)}
          onSwipeDown={() => onOpenChange(false)}
          swipeDownTarget={viewer}
          closeLabel={labels.close}
          onPrevious={previous}
          onNext={next}
          leftActions={leftActions}
          rightActions={rightActions}
          headerActions={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.grid}
              aria-pressed={grid}
              onClick={() => setGrid(!grid)}
              className="size-11 min-h-11 rounded-xl border border-document-overlay-border bg-document-overlay shadow-sm hover:bg-document-overlay"
            >
              <Grid3X3Icon aria-hidden="true" />
            </Button>
          }
          navigation={
            images.length > 1 ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.previous}
                  disabled={!previous}
                  onClick={previous}
                >
                  <ChevronLeftIcon aria-hidden="true" />
                </Button>
                <span role="status" className="px-1 text-xs tabular-nums">
                  {labels.position(index + 1, images.length)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.next}
                  disabled={!next}
                  onClick={next}
                >
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
              </>
            ) : null
          }
        >
          {() => (
            <ImagePreview
              key={image.src}
              src={image.src}
              alt={image.alt}
              grid={grid}
              loadingLabel={labels.loading}
              errorLabel={labels.error}
              retryLabel={labels.retry}
            />
          )}
        </DocumentZoom>
      ) : null}
    </MediaViewer>
  );
}
