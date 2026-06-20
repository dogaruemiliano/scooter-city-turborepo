import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./button";
import { Text } from "./Text";

const DemoBackdrop = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 overflow-hidden"
  >
    <div className="absolute top-10 left-12 h-32 w-32 rounded-full bg-blue-300" />
    <div className="absolute top-40 right-16 h-40 w-40 rounded-full bg-amber-200" />
    <div className="absolute top-1/3 left-1/2 h-24 w-24 -translate-x-1/2 rounded-lg bg-green-300" />
    <div className="absolute bottom-32 left-1/4 h-28 w-48 rounded-2xl bg-red-200" />
    <div className="absolute bottom-12 right-8 h-36 w-36 rotate-12 rounded-md bg-blue-200" />
    <div className="absolute top-1/2 left-10 h-20 w-64 -rotate-6 rounded-full bg-neutral-300" />
  </div>
);

const meta = {
  title: "Components/BottomSheet",
  component: BottomSheet,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    open: { control: "boolean" },
    backdrop: { control: "boolean" },
    title: { control: "text" },
  },
  args: {
    open: true,
    title: "Settings",
    backdrop: true,
    children: null,
  },
  decorators: [
    (Story) => (
      <div className="relative min-h-screen bg-background">
        <DemoBackdrop />
        <div className="relative p-6">
          <Text as="h3" size="lg" weight="semibold">
            Page content
          </Text>
          <Text as="p" color="secondary" className="mt-1">
            These shapes sit behind the sheet so the scrim is visible.
          </Text>
        </div>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <BottomSheet {...args}>
      <Text as="p" color="secondary">
        A bottom-anchored sheet. Backdrop dismisses; pass actions to render a
        footer bar.
      </Text>
    </BottomSheet>
  ),
};

export const WithActions: Story = {
  args: { title: "Delete account?" },
  render: (args) => (
    <BottomSheet
      {...args}
      actions={
        <>
          <Button variant="secondary" className="sm:flex-1">
            Cancel
          </Button>
          <Button variant="primary" className="sm:flex-1">
            Delete
          </Button>
        </>
      }
    >
      <Text as="p" color="secondary">
        This action cannot be undone. All your data will be permanently removed.
      </Text>
    </BottomSheet>
  ),
};

const InteractiveBottomSheet = () => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Open sheet</Button>
      <BottomSheet
        open={open}
        title="Interactive sheet"
        onClose={() => setOpen(false)}
        actions={
          <Button
            variant="primary"
            className="sm:flex-1"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        }
      >
        <Text as="p" color="secondary">
          Click outside or press Escape to dismiss.
        </Text>
      </BottomSheet>
    </div>
  );
};

export const Interactive: Story = {
  args: { open: false },
  render: () => <InteractiveBottomSheet />,
};
