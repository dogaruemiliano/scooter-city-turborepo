import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserAvatar } from "./user-avatar";
import { PlusIcon } from "lucide-react";
import { primitives } from "@repo/theme";

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

/** Non-square uploads fill the fixed avatar bounds with a centered crop. */
export const NonSquarePictures: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {["80 160", "160 80"].map((dimensions) => {
        const [width, height] = dimensions.split(" ");
        const src = `data:image/svg+xml,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 80 80" preserveAspectRatio="none"><path fill="${primitives.neutral[300]}" d="M0 0h80v80H0z"/><circle fill="${primitives.neutral[700]}" cx="40" cy="30" r="16"/><path fill="${primitives.neutral[700]}" d="M8 80a32 32 0 0 1 64 0"/></svg>`,
        )}`;
        return (
          <div key={dimensions} className="flex flex-col items-center gap-4">
            <UserAvatar name="Ada Lovelace" src={src} size="xl" />
            <UserAvatar name="Ada Lovelace" src={src} size="profile" />
            <UserAvatar
              name="Ada Lovelace"
              src={src}
              size="xl"
              shape="square"
            />
          </div>
        );
      })}
    </div>
  ),
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
