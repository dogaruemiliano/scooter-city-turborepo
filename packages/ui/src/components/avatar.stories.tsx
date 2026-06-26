import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlusIcon } from "lucide-react";

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@repo/ui/components/avatar";

const meta = {
  title: "Shadcn/Avatar",
  component: Avatar,
  tags: ["autodocs"],
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>ED</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar size="sm">
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MD</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <Avatar size="lg">
      <AvatarFallback>OS</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  ),
};

export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>AM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>DR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>KL</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>
        <PlusIcon />
        <span className="sr-only">3 more clinicians</span>
      </AvatarGroupCount>
    </AvatarGroup>
  ),
};
