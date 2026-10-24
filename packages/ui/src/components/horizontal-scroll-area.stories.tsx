import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardHeader, CardTitle } from "@repo/ui/components/card";
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
