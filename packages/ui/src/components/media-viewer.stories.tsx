import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  MediaCollection,
  useMediaCollection,
  type MediaCollectionItem,
} from "./media-collection";
import { MediaViewer, type MediaViewerProps } from "./media-viewer";
import { Button } from "./button";

const image = new URL(
  "../stories/fixtures/sample-document.png",
  import.meta.url,
).href;
const pdf = new URL("../stories/fixtures/sample-two-pages.pdf", import.meta.url)
  .href;
const props = {
  title: "Documents",
  imageAlt: "Document",
  closeLabel: "Close viewer",
  actionsLabel: "Media actions",
  openFileLabel: "Open file",
  cropLabel: "Crop image",
  removeLabel: "Remove file",
  saveLabel: "Confirm changes",
  gridLabel: "Toggle image grid",
  pendingLabel: "Applying changes…",
  editorLabels: { title: "Crop image", save: "Confirm changes" },
  imageLabels: {
    loadingLabel: "Loading preview",
    errorLabel: "Image could not be loaded",
    retryLabel: "Retry image",
  },
  pdfLabels: {
    error: "Preview unavailable",
    retry: "Retry preview",
    previousPage: "Previous page or document",
    nextPage: "Next page or document",
    pagePosition: (page, total) => `Page ${page} of ${total}`,
  },
  zoomLabels: {
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
  },
  collectionLabels: {
    previous: "Previous page or document",
    next: "Next page or document",
    position: (index, total) => `Doc. ${index} of ${total}`,
  },
} satisfies Omit<MediaViewerProps, "open" | "onOpenChange">;
const meta = {
  title: "Media/MediaViewer",
  component: MediaViewer,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof MediaViewer>;
export default meta;
function Open({ id, name }: { id: string; name: string }) {
  const collection = useMediaCollection();
  return (
    <Button variant="outline" onClick={() => collection?.open(id)}>
      {name}
    </Button>
  );
}
function Example() {
  const [replacement, setReplacement] = useState<File>();
  const documents: MediaCollectionItem[] = [
    {
      id: "image",
      src: replacement ? null : image,
      file: replacement,
      contentType: "image/png",
      fileName: "registration.png",
      onReplace: setReplacement,
    },
    {
      id: "pdf",
      src: pdf,
      contentType: "application/pdf",
      fileName: "two-pages.pdf",
    },
    {
      id: "last",
      src: image,
      contentType: "image/png",
      fileName: "last-document.png",
    },
  ];
  return (
    <div className="flex flex-col gap-6 p-6">
      <MediaCollection {...props} items={documents}>
        <section className="flex flex-wrap gap-3" aria-label="Document list">
          <Open id="image" name="Open registration image" />
          <Open id="pdf" name="Open two-page PDF" />
          <Open id="last" name="Open last document" />
        </section>
      </MediaCollection>
      <MediaCollection
        {...props}
        title="Separate photo list"
        items={[
          {
            id: "image",
            src: image,
            contentType: "image/png",
            fileName: "gallery-photo.png",
          },
        ]}
      >
        <Open id="image" name="Open separate photo list" />
      </MediaCollection>
    </div>
  );
}
export const MixedCollectionAndSeparateList: StoryObj = {
  render: () => <Example />,
};
export const BrokenPdf: StoryObj = {
  render: () => (
    <MediaViewer
      {...props}
      open
      onOpenChange={() => {}}
      contentType="application/pdf"
      src="data:application/pdf,broken"
    />
  ),
};
