import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";

const meta = {
  title: "Shadcn/Popover",
  component: Popover,
  tags: ["autodocs"],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        Open popover
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Appointment reminder</PopoverTitle>
          <PopoverDescription>
            Configure when the patient receives a reminder.
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reminder-hours">Hours before visit</Label>
          <Input id="reminder-hours" defaultValue="24" type="number" />
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const SideAligned: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        Right aligned
      </PopoverTrigger>
      <PopoverContent align="end" side="right">
        <PopoverHeader>
          <PopoverTitle>Quick note</PopoverTitle>
          <PopoverDescription>
            Side and alignment props follow the Base UI positioner.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
};
