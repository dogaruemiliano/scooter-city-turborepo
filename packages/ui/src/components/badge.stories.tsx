import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowUpRightIcon, IdCardIcon, CheckIcon } from "lucide-react";
import { EngineIcon } from "./engine-icon";

import { Badge } from "@repo/ui/components/badge";

const meta = {
  title: "Shadcn/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    iconSize: { control: "inline-radio", options: ["sm", "md"] },
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

export const VehicleDetails: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">
        <EngineIcon data-icon="inline-start" />
        125 cc
      </Badge>
      <Badge variant="secondary" iconSize="md">
        <IdCardIcon aria-hidden="true" data-icon="inline-start" />
        Cat. A1
      </Badge>
      <Badge variant="secondary" iconSize="md">
        <IdCardIcon aria-hidden="true" data-icon="inline-start" />
        Fără permis
      </Badge>
    </div>
  ),
};

/** Larger document icons retain the shared badge surface and text sizing. */
export const LargerIcon: Story = {
  args: {
    iconSize: "md",
    variant: "secondary",
    children: (
      <>
        <IdCardIcon aria-hidden="true" data-icon="inline-start" />
        Cat. A1
      </>
    ),
  },
};
