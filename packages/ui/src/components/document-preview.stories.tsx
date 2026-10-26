import { viewportSizing } from "@repo/theme";
import { DocumentStatus, type DocumentStatusState } from "./document-status";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { XIcon } from "lucide-react";
import { DocumentPreview } from "./document-preview";
import { Badge } from "./badge";
import { Button } from "./button";

const sampleDocumentUrl = new URL(
  "../stories/fixtures/sample-registration.svg",
  import.meta.url,
).href;

const meta = {
  title: "Documents/DocumentPreview",
  component: DocumentPreview,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    src: sampleDocumentUrl,
    contentType: "image/svg+xml",
    fileName: "sample-registration.svg",
    label: "Registration certificate",
    triggerLabel: "Preview registration certificate",
    imageAlt: "Registration certificate",
    title: "Registration certificate",
    closeLabel: "Close preview",
    openFileLabel: "Open file",
    actionsLabel: "Document actions",
    pdfLabels: {
      error: "Preview unavailable",
      previousPage: "Previous page",
      nextPage: "Next page",
    },
    zoomLabels: {
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      resetZoom: "Reset zoom",
    },
    open: false,
    onOpenChange: () => {},
  },
} satisfies Meta<typeof DocumentPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Landscape: Story = {};
/** Paper cards follow image/PDF proportions up to A4 portrait height, with interactive overlays. */
/** Header and footer share the scroll rail’s quintic smootherstep fade, with a darker text backing. */
export const PaperWithOverlays: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <div className="w-full max-w-96">
        <DocumentPreview
          {...args}
          layout="paper"
          open={open}
          onOpenChange={setOpen}
          viewerHeaderOverlay={
            <>
              <span className="min-w-0 truncate py-2 text-sm font-medium">
                sample-registration.svg
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close preview"
                className="text-scrim-foreground hover:bg-media-scrim hover:text-scrim-foreground"
                onClick={() => setOpen(false)}
              >
                <XIcon />
              </Button>
            </>
          }
          headerOverlay={
            <>
              <span className="min-w-0 truncate py-2 text-sm font-medium">
                sample-registration.svg
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove document"
                className="text-scrim-foreground hover:bg-media-scrim hover:text-scrim-foreground"
              >
                <XIcon />
              </Button>
            </>
          }
          bottomOverlay={
            <>
              <Badge>For client</Badge>
              <span className="text-xs">Details extracted</span>
            </>
          }
        />
      </div>
    );
  },
};

export const AllDocumentStates: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<string | null>(null);
    const states: { state: DocumentStatusState; label: string }[] = [
      { state: "uploading", label: "Uploading" },
      { state: "uploaded", label: "Uploaded" },
      { state: "queued", label: "Queued" },
      { state: "analyzing", label: "Analyzing" },
      { state: "analyzed", label: "Analyzed" },
      { state: "failed", label: "Upload failed" },
      { state: "failed", label: "Analysis failed" },
      { state: "needs-assignment", label: "Needs assignment" },
      { state: "needs-review", label: "Needs review" },
      { state: "preview-unavailable", label: "Preview unavailable" },
    ];

    return (
      <div
        className="grid w-full gap-3"
        style={{ gridTemplateColumns: viewportSizing.scooterDocumentGrid }}
      >
        {states.map(({ state, label }) => (
          <div
            key={label}
            className="w-full min-w-0"
            style={{ maxWidth: viewportSizing.scooterDocumentCardMax }}
          >
            <DocumentPreview
              {...args}
              layout="paper"
              src={sampleDocumentUrl}
              contentType="image/svg+xml"
              open={active === label}
              onOpenChange={(open) => setActive(open ? label : null)}
              title={label}
              triggerLabel={`Preview: ${label}`}
              imageAlt={`Sample document: ${label}`}
              headerOverlay={
                <span className="truncate py-2 text-sm font-medium">
                  sample-registration.svg
                </span>
              }
              bottomOverlay={<DocumentStatus state={state} label={label} />}
            />
            <p className="mt-2 text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    );
  },
};
