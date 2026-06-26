import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";

const meta = {
  title: "Shadcn/Switch",
  component: Switch,
  tags: ["autodocs"],
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="marketing" />
      <Label htmlFor="marketing">Marketing notifications</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="reminders" defaultChecked />
      <Label htmlFor="reminders">Appointment reminders</Label>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Switch aria-label="Small switch" size="sm" defaultChecked />
      <Switch aria-label="Default switch" defaultChecked />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="locked" disabled defaultChecked />
      <Label htmlFor="locked">Managed by organization policy</Label>
    </div>
  ),
};
