import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRightIcon, MoreHorizontalIcon } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAccent,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

const meta = {
  title: "Shadcn/Card",
  component: Card,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Care plan review</CardTitle>
        <CardDescription>Three updates require approval today.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Review changes submitted by the care team before they are sent to the
          patient.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Appointments</CardTitle>
        <CardDescription>Scheduled for today</CardDescription>
        <CardAction>
          <Button size="icon-sm" variant="ghost" aria-label="More options">
            <MoreHorizontalIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-3xl font-semibold">18</CardContent>
      <CardFooter className="justify-between">
        <Badge variant="secondary">On track</Badge>
        <Button size="sm" variant="ghost">
          View schedule
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Small: Story = {
  render: () => (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Waiting room</CardTitle>
        <CardDescription>Checked-in patients</CardDescription>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">4</CardContent>
    </Card>
  ),
};

export const StraightAccent: Story = {
  render: () => (
    <Card size="comfortable">
      <CardAccent className="bg-severity-high" />
      <CardHeader>
        <CardDescription>High severity</CardDescription>
        <CardTitle>Inspect front brake pads</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          A straight accent uses the shared spacing token and follows the full
          card height.
        </p>
      </CardContent>
    </Card>
  ),
};

export const RaisedEditor: Story = {
  render: () => (
    <Card as="section" surface="raised" aria-label="Member permissions">
      <CardHeader>
        <CardTitle>Edit permissions</CardTitle>
        <CardDescription>Review member access before saving.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Raised surfaces use the shared popover colors and responsive spacing.
        </p>
      </CardContent>
      <CardFooter className="justify-end gap-3">
        <Button variant="secondary">Cancel</Button>
        <Button>Save changes</Button>
      </CardFooter>
    </Card>
  ),
};

export const CompactRows: Story = {
  render: () => (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <p className="py-3">Scooter service completed</p>
        <p className="py-3">Rental documents updated</p>
      </CardContent>
    </Card>
  ),
};

export const BorderVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(["transparent", "default", "primary"] as const).map((border) => (
        <Card key={border} border={border}>
          <CardContent>{border} border</CardContent>
        </Card>
      ))}
    </div>
  ),
};
