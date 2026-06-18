import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider } from "./Divider";

const meta = {
  title: "Components/Divider",
  component: Divider,
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "inline-radio",
      options: ["horizontal", "vertical"],
    },
  },
  args: { orientation: "horizontal" },
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: (args) => (
    <div className="w-80">
      <Divider {...args} />
    </div>
  ),
};

export const HorizontalWithLabel: Story = {
  render: (args) => (
    <div className="w-80">
      <Divider {...args}>or continue with</Divider>
    </div>
  ),
};

export const Vertical: Story = {
  args: { orientation: "vertical" },
  render: (args) => (
    <div className="flex h-12 items-center gap-4">
      <span className="text-sm text-muted-foreground">Left</span>
      <Divider {...args} />
      <span className="text-sm text-muted-foreground">Right</span>
    </div>
  ),
};

export const VerticalWithLabel: Story = {
  args: { orientation: "vertical" },
  render: (args) => (
    <div className="flex h-40 items-stretch gap-4">
      <span className="text-sm text-muted-foreground">Top</span>
      <Divider {...args}>or</Divider>
      <span className="text-sm text-muted-foreground">Bottom</span>
    </div>
  ),
};
