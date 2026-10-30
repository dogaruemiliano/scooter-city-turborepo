"use client";

import { useState, type ComponentProps } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "./button";
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
  removal,
  hint,
  className = "grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-3",
  ...grid
}: Omit<
  ComponentProps<typeof SortableGrid<Item>>,
  "onItemPress" | "removal" | "renderItemActions"
> & {
  images: readonly ViewerImage[];
  title: string;
  labels: ImageViewerLabels;
  hint?: string;
  removal?: NonNullable<
    ComponentProps<typeof SortableGrid<Item>>["removal"]
  > & {
    /** Accessible name for the persistent delete button. Omit for drag-only removal. */
    getButtonLabel?: (item: Item) => string;
  };
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const getRemoveLabel = removal?.getButtonLabel;
  return (
    <>
      {hint ? (
        <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <SortableGrid
        {...grid}
        className={className}
        removal={removal}
        renderItemActions={
          removal && getRemoveLabel
            ? (item, disabled) => (
                <Button
                  type="button"
                  variant="secondary-destructive"
                  size="icon"
                  className="absolute right-2 top-2"
                  disabled={disabled}
                  aria-label={getRemoveLabel(item)}
                  title={getRemoveLabel(item)}
                  onClick={() => void removal.onRemove(item)}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              )
            : undefined
        }
        onItemPress={(item) => setActiveId(item.id)}
      />
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
