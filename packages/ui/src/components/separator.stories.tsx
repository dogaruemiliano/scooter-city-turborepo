import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "@repo/ui/components/separator";

const meta = {
  title: "Shadcn/Separator",
  component: Separator,
  tags: ["autodocs"],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-80">
      <div className="text-sm font-medium">Patient details</div>
      <Separator className="my-3" />
      <div className="text-sm text-muted-foreground">
        Demographics, contact details, and address.
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-16 items-center gap-4 text-sm">
      <span>Overview</span>
      <Separator orientation="vertical" />
      <span>Appointments</span>
      <Separator orientation="vertical" />
      <span>Billing</span>
    </div>
  ),
};
