"use client";

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@repo/ui/components/bottom-sheet";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

const meta = {
  title: "Shadcn/BottomSheet",
  component: BottomSheet,
  tags: ["autodocs"],
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <BottomSheet>
      <BottomSheetTrigger render={<Button variant="outline" />}>
        Open bottom sheet
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Filter wallets</BottomSheetTitle>
          <BottomSheetDescription>
            Narrow the wallet list using one or more filters.
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody>
          <Label htmlFor="bottom-sheet-search">Search</Label>
          <Input id="bottom-sheet-search" placeholder="Wallet name" />
        </BottomSheetBody>
        <BottomSheetFooter>
          <Button>Apply filters</Button>
          <BottomSheetClose render={<Button variant="ghost" />}>
            Cancel
          </BottomSheetClose>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  ),
};

function SnapPointsExample() {
  const [snapPoint, setSnapPoint] =
    React.useState<BottomSheetPrimitiveSnapPoint | null>(0.5);

  return (
    <BottomSheet
      snapPoints={[0.5, 1]}
      snapPoint={snapPoint}
      onSnapPointChange={setSnapPoint}
    >
      <BottomSheetTrigger render={<Button variant="outline" />}>
        Open snap-point sheet
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Choose a wallet</BottomSheetTitle>
          <BottomSheetDescription>
            Drag the handle to move between half-height and full-height.
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody>
          {Array.from({ length: 16 }, (_, index) => (
            <Button key={index} variant="outline" className="justify-start">
              Wallet {index + 1}
            </Button>
          ))}
        </BottomSheetBody>
        <BottomSheetFooter>
          <BottomSheetClose render={<Button />}>Done</BottomSheetClose>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}

type BottomSheetPrimitiveSnapPoint = NonNullable<
  React.ComponentProps<typeof BottomSheet>["snapPoints"]
>[number];

export const SnapPoints: Story = {
  render: () => <SnapPointsExample />,
};
