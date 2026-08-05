import type { Meta, StoryObj } from "@storybook/react-vite";

import { SaveButton } from "@repo/ui/components/save-button";

const meta = {
  title: "Components/SaveButton",
  component: SaveButton,
  tags: ["autodocs"],
  argTypes: {
    state: {
      control: "inline-radio",
      options: ["idle", "pending", "success"],
    },
  },
  args: {
    idleLabel: "Save",
    pendingLabel: "Saving...",
    successLabel: "Saved",
    state: "idle",
  },
} satisfies Meta<typeof SaveButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <SaveButton {...args} state="idle" />
      <SaveButton {...args} state="pending" />
      <SaveButton {...args} state="success" />
    </div>
  ),
};
