import { viewportSizing } from "@repo/theme";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { HorizontalScrollArea } from "@repo/ui/components/horizontal-scroll-area";

const meta = {
  title: "Shadcn/HorizontalScrollArea",
  component: HorizontalScrollArea,
  tags: ["autodocs"],
} satisfies Meta<typeof HorizontalScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatusLanes: Story = {
  args: {
    label: "Repair status lanes",
    scrollRightLabel: "Scroll repairs right",
  },
  render: (args) => (
    <div className="w-full max-w-lg">
      <HorizontalScrollArea {...args}>
        <div className="flex gap-6">
          {["Open", "In progress", "Resolved", "Dismissed"].map((status) => (
            <Card key={status} className="w-72 shrink-0">
              <CardHeader>
                <CardTitle>{status}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </HorizontalScrollArea>
    </div>
  ),
};

export const FadedDraftRail: Story = {
  args: { label: "Scooter drafts", fadeEdges: true },
  render: (args) => (
    <div className="w-full max-w-sm">
      <HorizontalScrollArea {...args}>
        <div className="flex w-max gap-2 p-2">
          {[
            "Awaiting documents",
            "Analysing",
            "Needs review",
            "Ready to create",
          ].map((status) => (
            <Card key={status} className="w-48 shrink-0">
              <CardHeader>
                <CardTitle>{status}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </HorizontalScrollArea>
    </div>
  ),
};

export const TouchDraftRail: Story = {
  ...FadedDraftRail,
  args: { ...FadedDraftRail.args, scrollbarVisibility: "desktop" },
};

/** Cards stay relative to their parent, leaving ten percent of the next card visible. */
export const SnappingDocumentCards: Story = {
  args: {
    label: "Documents",
    fadeWidth: "var(--spacing-3)",
    contentWidth: "viewport",
    fadeEdges: true,
    snap: true,
    scrollbarVisibility: "desktop",
  },
  render: (args) => (
    <div className="w-full max-w-sm">
      <HorizontalScrollArea {...args}>
        <ul
          className="grid w-full grid-flow-col gap-3"
          style={{ gridAutoColumns: viewportSizing.scooterDocumentCard }}
        >
          {["CIV", "Insurance", "Registration"].map((title) => (
            <li key={title} className="min-w-0 snap-start">
              <Card>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </HorizontalScrollArea>
    </div>
  ),
};

/** The fade stays over the surrounding surface padding while cards scroll underneath. */
export const PermanentPaddingFade: Story = {
  args: {
    ...SnappingDocumentCards.args,
    fadeEdges: "always",
    fadeWidth: "var(--card-spacing)",
  },
  render: (args) => (
    <Card className="w-full max-w-sm">
      <CardContent>
        <HorizontalScrollArea {...args} className="-mx-(--card-spacing) w-auto">
          <ul
            className="grid w-full grid-flow-col gap-3 px-(--card-spacing)"
            style={{ gridAutoColumns: viewportSizing.scooterDocumentCard }}
          >
            {["CIV", "Insurance", "Registration"].map((title) => (
              <li key={title} className="min-w-0 snap-start">
                <Card>
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </HorizontalScrollArea>
      </CardContent>
    </Card>
  ),
};
