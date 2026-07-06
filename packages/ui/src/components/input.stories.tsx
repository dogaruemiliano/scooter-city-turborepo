import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

const meta = {
  title: "Shadcn/Input",
  component: Input,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "patient@example.com",
    type: "email",
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="email">Email address</Label>
      <Input id="email" placeholder="patient@example.com" type="email" />
    </div>
  ),
};

export const Invalid: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="invalid-email">Email address</Label>
      <Input
        id="invalid-email"
        aria-invalid
        defaultValue="patient"
        type="email"
      />
      <p className="text-sm text-destructive">Enter a valid email address.</p>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: "locked@example.com",
  },
};

export const File: Story = {
  args: {
    type: "file",
  },
};
