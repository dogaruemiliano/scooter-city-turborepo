import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SegmentedRadioGroup } from "@repo/ui/components/segmented-radio-group";

const meta = {
  title: "Shadcn/SegmentedRadioGroup",
  component: SegmentedRadioGroup,
  tags: ["autodocs"],
  args: {
    label: "Access preference",
    name: "access-preference",
    value: "default",
    onValueChange: () => {},
    options: [
      { value: "allow", label: "Allow", tone: "primary" },
      { value: "default", label: "Default", tone: "neutral" },
      { value: "deny", label: "Deny", tone: "destructive" },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SegmentedRadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function InteractiveGroup(args) {
    const [value, setValue] = useState(args.value);
    return (
      <SegmentedRadioGroup {...args} value={value} onValueChange={setValue} />
    );
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const Pills: Story = {
  args: {
    appearance: "pills",
    label: "Quick filters",
    name: "quick-filters",
    value: "",
    deselectValue: "",
    options: [
      { value: "open", label: "Open", tone: "primary" },
      { value: "mine", label: "Mine", tone: "primary" },
      { value: "resolved", label: "Resolved", tone: "primary" },
    ],
  },
  render: Default.render,
};

export const TwoOptions: Story = {
  args: {
    label: "Layout",
    name: "layout",
    value: "list",
    options: [
      { value: "list", label: "List", tone: "primary" },
      { value: "grid", label: "Grid", tone: "primary" },
    ],
  },
  render: Default.render,
};

export const TwoByTwo: Story = {
  args: {
    label: "Status",
    name: "status-filter",
    columns: 2,
    value: "",
    deselectValue: "",
    showCheckmark: true,
    options: [
      { value: "open", label: "Open" },
      { value: "in_progress", label: "In progress" },
      { value: "resolved", label: "Resolved" },
      { value: "cancelled", label: "Dismissed" },
    ],
  },
  render: Default.render,
};
