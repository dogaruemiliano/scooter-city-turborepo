import type { Meta, StoryObj } from "@storybook/react-vite";
import { Snackbar } from "./Snackbar";
import { Button } from "./button";

const meta = {
  title: "Components/Snackbar",
  component: Snackbar,
  tags: ["autodocs"],
  argTypes: {
    open: { control: "boolean" },
    position: { control: "inline-radio", options: ["top", "bottom"] },
  },
  args: {
    open: true,
    position: "bottom",
    message: "Saved your changes.",
  },
} satisfies Meta<typeof Snackbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithActions: Story = {
  args: {
    message: "Item moved to trash.",
    actions: (
      <>
        <Button variant="secondary" size="sm">
          Undo
        </Button>
        <Button variant="primary" size="sm">
          Dismiss
        </Button>
      </>
    ),
  },
};

export const WithIconAndActions: Story = {
  args: {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    ),
    message: "Your session will expire in 5 minutes.",
    actions: (
      <Button variant="primary" size="sm">
        Stay signed in
      </Button>
    ),
  },
};
