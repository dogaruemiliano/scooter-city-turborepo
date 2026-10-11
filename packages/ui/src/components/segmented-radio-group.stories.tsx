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
