import type { Meta, StoryObj } from "@storybook/react-vite";
import { primitives, spacing } from "@repo/theme";
import { useState } from "react";
import { ImageViewer, type ImageViewerLabels } from "./image-viewer";
import { Button } from "./button";

const meta = {
  title: "Media/ImageViewer",
  component: ImageViewer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ImageViewer>;
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
// Self-contained aspect-ratio fixtures for verifying fit, grid alignment, and navigation.
const fixture = (width: number, height: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${primitives.charcoal[950]}"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="transparent" stroke="${primitives.mist[0]}" stroke-width="${spacing[0.5]}"/></svg>`)}`;
function Example() {
  const [open, setOpen] = useState(true);
  const [id, setId] = useState("landscape");
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open images</Button>
      <ImageViewer
        open={open}
        onOpenChange={setOpen}
        activeId={id}
        onActiveIdChange={setId}
        title="Image collection"
        labels={labels}
        images={[
          {
            id: "landscape",
            src: fixture(1200, 800),
            alt: "Landscape fixture",
          },
          { id: "portrait", src: fixture(800, 1200), alt: "Portrait fixture" },
        ]}
        leftActions={
          <Button variant="outline" onClick={() => setId("landscape")}>
            First image
          </Button>
        }
      />
    </>
  );
}
export const Collection: StoryObj = { render: () => <Example /> };
