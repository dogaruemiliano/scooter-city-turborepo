import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

const meta = {
  title: "Shadcn/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Add a private note",
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="care-note">Care note</Label>
      <Textarea id="care-note" placeholder="Summarize the appointment" />
    </div>
  ),
};

export const Invalid: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="invalid-note">Care note</Label>
      <Textarea id="invalid-note" aria-invalid defaultValue="" />
      <p className="text-sm text-destructive">A note is required.</p>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: "This note is locked after signature.",
  },
};
