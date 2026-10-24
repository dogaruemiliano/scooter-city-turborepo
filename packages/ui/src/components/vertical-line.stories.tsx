import type { Meta, StoryObj } from "@storybook/react-vite";

import { VerticalLine } from "@repo/ui/components/vertical-line";

const meta = {
  title: "Shadcn/VerticalLine",
  component: VerticalLine,
  tags: ["autodocs"],
} satisfies Meta<typeof VerticalLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="flex items-center gap-3 text-base font-semibold">
      <VerticalLine {...args} />
      Section title
    </div>
  ),
};
