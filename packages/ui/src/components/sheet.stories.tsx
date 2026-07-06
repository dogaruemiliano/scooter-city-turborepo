import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";

const meta = {
  title: "Shadcn/Sheet",
  component: Sheet,
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function SheetExample({
  side = "right",
}: {
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        Open {side} sheet
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Edit patient</SheetTitle>
          <SheetDescription>
            Update the display name used across the workspace.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          <Label htmlFor={`sheet-name-${side}`}>Display name</Label>
          <Input id={`sheet-name-${side}`} defaultValue="Emilia Stone" />
        </div>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export const Right: Story = {
  render: () => <SheetExample />,
};

export const Left: Story = {
  render: () => <SheetExample side="left" />,
};

export const Top: Story = {
  render: () => <SheetExample side="top" />,
};

export const Bottom: Story = {
  render: () => <SheetExample side="bottom" />,
};
