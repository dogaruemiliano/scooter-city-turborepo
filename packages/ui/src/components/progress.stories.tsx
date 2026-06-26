import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@repo/ui/components/progress";

const meta = {
  title: "Shadcn/Progress",
  component: Progress,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 64,
  },
};

export const WithLabel: Story = {
  args: {
    value: 72,
  },
  render: () => (
    <Progress value={72}>
      <ProgressLabel>Profile completion</ProgressLabel>
      <ProgressValue />
    </Progress>
  ),
};

export const States: Story = {
  args: {
    value: 100,
  },
  render: () => (
    <div className="flex flex-col gap-4">
      <Progress value={24}>
        <ProgressLabel>Intake</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Progress value={58}>
        <ProgressLabel>Verification</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Progress value={100}>
        <ProgressLabel>Completed</ProgressLabel>
        <ProgressValue />
      </Progress>
    </div>
  ),
};
