import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserAvatar } from "./user-avatar";
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
      <Avatar size="xl">
        <AvatarFallback>XL</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const SquareInitials: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar shape="square" size="lg" aria-label="Alex Morgan">
        <AvatarFallback>AM</AvatarFallback>
      </Avatar>
      <Avatar shape="square" size="xl" aria-label="Maria Ionescu">
        <AvatarFallback>MI</AvatarFallback>
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

/** Embedded fixture keeps the image and fallback examples independent of network availability. */
const avatarFixture =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
export const UserPicture: Story = {
  render: () => (
    <UserAvatar name="Ada Lovelace" src={avatarFixture} size="xl" />
  ),
};
export const UserInitials: Story = {
  render: () => <UserAvatar name="Ada Lovelace" size="xl" />,
};
export const FailedUserPicture: Story = {
  render: () => (
    <UserAvatar name="Ada Lovelace" src="/missing-avatar.png" size="xl" />
  ),
};

/** Large profile portrait for detail headers, using the theme spacing and type scales. */
export const ProfilePortrait: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <UserAvatar size="profile" name="Ada Lovelace" src={avatarFixture} />
      <UserAvatar size="profile" name="Ada Lovelace" />
    </div>
  ),
};
