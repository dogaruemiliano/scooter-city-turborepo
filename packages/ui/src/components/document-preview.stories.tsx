import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { XIcon } from "lucide-react";
import { DocumentPreview } from "./document-preview";
import { Badge } from "./badge";
import { Button } from "./button";

const meta = {
  title: "Documents/DocumentPreview",
  component: DocumentPreview,
  tags: ["autodocs"],
  args: {
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
export const PaperWithOverlays: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <div className="max-w-96">
        <DocumentPreview
          {...args}
          layout="paper"
          open={open}
          onOpenChange={setOpen}
          viewerHeaderOverlay={
            <>
              <span className="min-w-0 truncate py-2 text-sm font-medium">
                registration.pdf
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
                registration.pdf
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
