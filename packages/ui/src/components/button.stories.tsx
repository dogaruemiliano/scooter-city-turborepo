import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ArrowRightIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";

const meta = {
  title: "Shadcn/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: [
        "default",
        "outline",
        "secondary",
        "ghost",
        "destructive",
        "link",
      ],
    },
    size: {
      control: "inline-radio",
      options: [
        "default",
        "xs",
        "sm",
        "lg",
        "icon",
        "icon-xs",
        "icon-sm",
        "icon-lg",
      ],
    },
  },
  args: {
    children: "Button",
    size: "default",
    variant: "default",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>
        <PlusIcon data-icon="inline-start" />
        Add patient
      </Button>
      <Button variant="outline">
        Export
        <DownloadIcon data-icon="inline-end" />
      </Button>
      <Button variant="secondary">
        Continue
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  ),
};

export const IconButtons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon-xs" variant="outline" aria-label="More options">
        <MoreHorizontalIcon />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label="More options">
        <MoreHorizontalIcon />
      </Button>
      <Button size="icon" variant="outline" aria-label="More options">
        <MoreHorizontalIcon />
      </Button>
      <Button size="icon-lg" variant="destructive" aria-label="Delete record">
        <Trash2Icon />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    children: "Saving",
    disabled: true,
  },
};

export const AsLink: Story = {
  render: () => (
    <Button nativeButton={false} render={<a href="#patient-profile" />}>
      Open patient profile
    </Button>
  ),
};
