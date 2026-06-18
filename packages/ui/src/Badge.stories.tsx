import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";

const meta = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["neutral", "action", "danger", "success", "warning"],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
  },
  args: { children: "New", variant: "neutral", size: "sm" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {
  render: (args) => (
    <>
      <div className="bg-card p-4 rounded justify-center items-center flex flex-col">
        <Badge {...args} variant={args.variant}>
          {`${args.variant?.charAt(0).toUpperCase()}${args.variant?.slice(1)}`}
        </Badge>
      </div>
    </>
  ),
};

export const Variants: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 bg-card p-4 rounded">
      <Badge {...args} variant="neutral">
        Neutral
      </Badge>
      <Badge {...args} variant="action">
        Info
      </Badge>
      <Badge {...args} variant="success">
        Verified
      </Badge>
      <Badge {...args} variant="warning">
        Pending
      </Badge>
      <Badge {...args} variant="danger">
        Failed
      </Badge>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-2 bg-card p-4 rounded">
      <Badge {...args} size="sm">
        Small
      </Badge>
      <Badge {...args} size="md">
        Medium
      </Badge>
    </div>
  ),
};
