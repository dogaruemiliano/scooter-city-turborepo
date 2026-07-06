import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

const meta = {
  title: "Shadcn/Label",
  component: Label,
  tags: ["autodocs"],
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {
  render: () => (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <Label htmlFor="label-email">Email address</Label>
      <Input id="label-email" placeholder="patient@example.com" />
    </div>
  ),
};

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="label-checkbox" />
      <Label htmlFor="label-checkbox">Receive care plan updates</Label>
    </div>
  ),
};

export const DisabledPeer: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="label-disabled" disabled />
      <Label htmlFor="label-disabled">Disabled option</Label>
    </div>
  ),
};
