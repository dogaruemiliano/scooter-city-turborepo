import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertCircleIcon, CheckCircleIcon, XIcon } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";

const meta = {
  title: "Shadcn/Alert",
  component: Alert,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert>
      <CheckCircleIcon />
      <AlertTitle>Profile saved</AlertTitle>
      <AlertDescription>
        The latest contact and notification settings are now active.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>Payment failed</AlertTitle>
      <AlertDescription>
        The card could not be authorized. Ask the patient for another payment
        method.
      </AlertDescription>
    </Alert>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Session expires soon</AlertTitle>
      <AlertDescription>
        Save your changes before the current session is refreshed.
      </AlertDescription>
      <AlertAction>
        <Button size="icon-sm" variant="ghost" aria-label="Dismiss alert">
          <XIcon />
        </Button>
      </AlertAction>
    </Alert>
  ),
};
