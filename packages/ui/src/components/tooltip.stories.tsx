import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoIcon, SaveIcon } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";

const meta = {
  title: "Shadcn/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button size="icon" variant="outline" />}>
        <InfoIcon />
        <span className="sr-only">More information</span>
      </TooltipTrigger>
      <TooltipContent>
        Patient-visible fields are marked in the portal.
      </TooltipContent>
    </Tooltip>
  ),
};

export const WithShortcut: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>
        <SaveIcon data-icon="inline-start" />
        Save
      </TooltipTrigger>
      <TooltipContent>
        Save changes
        <kbd data-slot="kbd">Cmd+S</kbd>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Sides: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger render={<Button variant="outline" />}>
            {side}
          </TooltipTrigger>
          <TooltipContent side={side}>Tooltip on {side}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
};
