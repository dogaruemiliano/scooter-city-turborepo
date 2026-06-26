import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";

const meta = {
  title: "Shadcn/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="consent" />
      <Label htmlFor="consent">Patient consent received</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="checked" defaultChecked />
      <Label htmlFor="checked">Send reminder email</Label>
    </div>
  ),
};

export const Invalid: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="invalid" aria-invalid />
      <Label htmlFor="invalid">Required before continuing</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="disabled" disabled defaultChecked />
      <Label htmlFor="disabled">Locked by policy</Label>
    </div>
  ),
};
