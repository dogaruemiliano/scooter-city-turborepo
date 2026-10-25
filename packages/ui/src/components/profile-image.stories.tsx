import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProfileImage } from "./profile-image";

const meta = {
  title: "Identity/ProfileImage",
  component: ProfileImage,
  tags: ["autodocs"],
} satisfies Meta<typeof ProfileImage>;
export default meta;
type Story = StoryObj<typeof meta>;

const portrait =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

export const Initials: Story = { args: { name: "Ada Lovelace" } };
export const Picture: Story = { args: { name: "Ada Lovelace", src: portrait } };
const editable = {
  name: "Ada Lovelace",
  addLabel: "Add picture",
  editLabel: "Change picture",
  onEdit: () => {},
};
export const AddPicture: Story = { args: editable };
export const ChangePicture: Story = {
  args: {
    ...editable,
    src: portrait,
    onRemove: () => {},
    removeLabel: "Remove picture",
  },
};
export const Disabled: Story = {
  args: { ...editable, src: portrait, disabled: true },
};
export const FailedPicture: Story = {
  args: { ...editable, src: "/missing-portrait.png" },
};
