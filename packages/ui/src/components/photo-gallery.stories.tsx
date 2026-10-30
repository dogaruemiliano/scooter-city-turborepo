import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { aspectRatio } from "@repo/theme";
import { PhotoGallery } from "./photo-gallery";
import type { ImageViewerLabels } from "./image-viewer";

const meta = {
  title: "Media/PhotoGallery",
  component: PhotoGallery,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PhotoGallery>;
export default meta;

const labels: ImageViewerLabels = {
  close: "Close",
  previous: "Previous image",
  next: "Next image",
  grid: "Toggle image grid",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
  loading: "Loading image",
  error: "Image could not be loaded",
  retry: "Retry",
  position: (index, count) => `${index} / ${count}`,
};
const scooterImage = new URL(
  "../../../../apps/web/public/scooter-placeholder.png",
  import.meta.url,
).href;
const initialPhotos = [
  { id: "front", fileName: "Front view", src: scooterImage },
  { id: "side", fileName: "Side view", src: scooterImage },
];

function Example({
  readOnly = false,
  disabled = false,
}: {
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  return (
    <div className="grid gap-4">
      <PhotoGallery
        items={photos}
        images={photos.map((photo) => ({ ...photo, alt: photo.fileName }))}
        title="Scooter photos"
        labels={labels}
        hint={
          readOnly ? undefined : "Drag to reorder. Touch and hold on mobile."
        }
        instructions="Press Space to pick up, use arrow keys to move, then Space to drop."
        disabled={readOnly || disabled}
        getItemLabel={(photo) => `Open photo: ${photo.fileName}`}
        onOrderChange={async (ids) => {
          setPhotos(ids.map((id) => photos.find((photo) => photo.id === id)!));
          return true;
        }}
        removal={
          readOnly
            ? undefined
            : {
                label: "Drag a photo here to delete it",
                activeLabel: "Release to delete this photo",
                getButtonLabel: (photo) => `Delete photo: ${photo.fileName}`,
                onRemove: async (photo) => {
                  setPhotos((current) =>
                    current.filter((item) => item.id !== photo.id),
                  );
                  return true;
                },
              }
        }
        renderItem={(photo) => (
          <img
            src={photo.src}
            alt={photo.fileName}
            draggable={false}
            style={{ aspectRatio: aspectRatio.scooterPhoto }}
            className="block w-full bg-muted object-cover"
          />
        )}
      />
    </div>
  );
}

export const Editable: StoryObj = { render: () => <Example /> };
export const ReadOnly: StoryObj = { render: () => <Example readOnly /> };
export const Disabled: StoryObj = { render: () => <Example disabled /> };
