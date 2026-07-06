import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowUpRightIcon, CheckIcon } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";

const meta = {
  title: "Shadcn/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: [
        "default",
        "secondary",
        "destructive",
        "outline",
        "ghost",
        "link",
      ],
    },
  },
  args: {
    children: "Active",
    variant: "default",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="link">Link</Badge>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>
        <CheckIcon data-icon="inline-start" />
        Verified
      </Badge>
      <Badge variant="outline">
        Open record
        <ArrowUpRightIcon data-icon="inline-end" />
      </Badge>
    </div>
  ),
};

export const AsLink: Story = {
  render: () => (
    <Badge variant="link" render={<a href="#billing" />}>
      Billing profile
    </Badge>
  ),
};
