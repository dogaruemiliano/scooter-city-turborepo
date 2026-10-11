import type { Meta, StoryObj } from "@storybook/react-vite";

import { NativeSelect } from "@repo/ui/components/native-select";

const meta = {
  title: "Shadcn/NativeSelect",
  component: NativeSelect,
  tags: ["autodocs"],
  args: {
    "aria-label": "Visibility",
    defaultValue: "assigned",
    children: (
      <>
        <option value="assigned">Assigned records</option>
        <option value="all">All records</option>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NativeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Compact: Story = { args: { size: "sm" } };
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = { args: { "aria-invalid": true } };
