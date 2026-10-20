import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, UserPlus } from "lucide-react";
import { AddAction } from "./add-action";

const meta = {
  title: "Actions/AddAction",
  component: AddAction,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: { text: "Add", icon: <Plus /> },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-(--breakpoint-md) p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddAction>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Compact: Story = {
  args: { text: "Add item", size: "compact" },
};
export const WithSubtext: Story = {
  args: { subtext: "Checklist · Buy list · Location" },
};
export const Assignee: Story = {
  args: { text: "Add assignee", icon: <UserPlus /> },
};
export const Disabled: Story = {
  args: { disabled: true, subtext: "Checklist · Buy list · Location" },
};
