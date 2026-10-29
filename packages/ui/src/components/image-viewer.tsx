"use client";
import type { ReactNode } from "react";
import { MediaViewer } from "./media-viewer";
import type { DocumentZoomLabels } from "./document-zoom";
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
  return (
    <MediaViewer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      slot="image-viewer"
      items={images.map((image) => ({
        ...image,
        fileName: image.fileName ?? image.alt,
        contentType: "image/*",
      }))}
      activeId={activeId}
      onActiveIdChange={onActiveIdChange}
      collectionLabels={labels}
      imageLabels={{
        loadingLabel: labels.loading,
        errorLabel: labels.error,
        retryLabel: labels.retry,
      }}
      closeLabel={labels.close}
      gridLabel={labels.grid}
      swipeDismiss
      actionsLabel=""
      openFileLabel=""
      imageAlt={title}
      pdfLabels={{
        error: labels.error,
        previousPage: labels.previous,
        nextPage: labels.next,
      }}
      zoomLabels={labels}
      leftActions={leftActions}
      rightActions={rightActions}
      footer={footer}
    />
  );
}
