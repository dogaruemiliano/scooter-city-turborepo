import { viewportSizing } from "@repo/theme";
import type { CSSProperties } from "react";
import { HorizontalScrollArea } from "./horizontal-scroll-area";
import { DocumentPreview } from "./document-preview";
import { DocumentStatus } from "./document-status";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FileDropZone } from "./file-drop-zone";

const meta = {
  title: "Forms/FileDropZone",
  component: FileDropZone,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    label: "Drop documents here",
    mobileLabel: "Select documents",
    browseLabel: "Browse files",
    hint: "PDF or images. Upload limits are checked by the application.",
    accept: "application/pdf,image/*",
    onFiles: () => {},
  },
} satisfies Meta<typeof FileDropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Example(args) {
    const [files, setFiles] = useState<File[]>([]);
    return (
      <div className="grid w-full max-w-(--breakpoint-md) gap-4">
        <FileDropZone {...args} onFiles={setFiles} />
        <p role="status" className="text-sm text-muted-foreground">
          {files.map((file) => file.name).join(", ")}
        </p>
      </div>
    );
  },
};

export const Disabled: Story = { args: { disabled: true } };

/** Mobile uses a compact preview-style selection card; desktop retains drag-and-drop. */
export const MobileSelection: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { requirements: "PDF, JPG, PNG or WebP, up to 15 MB each." },
};

/** Desktop is one drop gallery. Mobile keeps its picker below the swipeable cards. */
export const PopulatedGallery: Story = {
  args: {
    addLabel: "Add document",
    requirements: "PDF, JPG, PNG or WebP, up to 15 MB each.",
  },
  render: function Gallery(args) {
    const [names, setNames] = useState([
      "Sample registration",
      "Sample insurance",
    ]);
    const [active, setActive] = useState<string | null>(null);
    const src = new URL(
      "../stories/fixtures/sample-registration.svg",
      import.meta.url,
    ).href;
    return (
      <div className="grid w-full gap-4">
        <FileDropZone
          {...args}
          onFiles={(files) =>
            setNames((current) => [
              ...current,
              ...files.map((file) => file.name),
            ])
          }
        >
          {(addCard) => (
            <HorizontalScrollArea
              label="Documents"
              snap
              contentWidth="viewport"
              scrollbarVisibility="desktop"
            >
              <ul
                className="grid w-full grid-flow-col auto-cols-(--document-card-width) gap-3 md:grid-flow-row md:auto-cols-auto md:grid-cols-(--document-grid-columns) md:[&>li]:max-w-(--document-card-max-width)"
                style={
                  {
                    "--document-card-width": viewportSizing.scooterDocumentCard,
                    "--document-grid-columns":
                      viewportSizing.scooterDocumentGrid,
                    "--document-card-max-width":
                      viewportSizing.scooterDocumentCardMax,
                  } as CSSProperties
                }
              >
                {names.map((name, index) => (
                  <li key={`${index}:${name}`} className="min-w-0 snap-start">
                    <DocumentPreview
                      layout="paper"
                      src={src}
                      contentType="image/svg+xml"
                      label={name}
                      triggerLabel={`Preview ${name}`}
                      imageAlt={name}
                      title={name}
                      closeLabel="Close preview"
                      openFileLabel="Open file"
                      actionsLabel="Document actions"
                      pdfLabels={{
                        error: "Preview unavailable",
                        previousPage: "Previous page",
                        nextPage: "Next page",
                      }}
                      zoomLabels={{
                        zoomIn: "Zoom in",
                        zoomOut: "Zoom out",
                        resetZoom: "Reset zoom",
                      }}
                      open={active === name}
                      onOpenChange={(open) => setActive(open ? name : null)}
                      headerOverlay={
                        <span className="truncate py-2 text-sm font-medium">
                          {name}
                        </span>
                      }
                      bottomOverlay={
                        <DocumentStatus state="uploaded" label="Uploaded" />
                      }
                    />
                  </li>
                ))}
                {addCard ? <li className="min-w-0">{addCard}</li> : null}
              </ul>
            </HorizontalScrollArea>
          )}
        </FileDropZone>
      </div>
    );
  },
};

export const PopulatedMobile: Story = {
  ...PopulatedGallery,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
