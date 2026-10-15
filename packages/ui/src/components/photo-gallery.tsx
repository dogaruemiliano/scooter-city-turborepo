"use client";

import { useState, type ComponentProps } from "react";
import { SortableGrid } from "./sortable-grid";
import {
  ImageViewer,
  type ViewerImage,
  type ImageViewerLabels,
} from "./image-viewer";

/** The shared scooter/task gallery: accessible grid, optional sorting, and full-image viewer. */
export function PhotoGallery<Item extends { id: string }>({
  images,
  title,
  labels,
  ...grid
}: Omit<ComponentProps<typeof SortableGrid<Item>>, "onItemPress"> & {
  images: readonly ViewerImage[];
  title: string;
  labels: ImageViewerLabels;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <>
      <SortableGrid {...grid} onItemPress={(item) => setActiveId(item.id)} />
      <ImageViewer
        open={activeId !== null}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        images={images}
        title={title}
        labels={labels}
      />
    </>
  );
}
