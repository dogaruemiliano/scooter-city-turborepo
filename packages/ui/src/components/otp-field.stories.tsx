import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "@repo/ui/components/label";
import { OTPField } from "@repo/ui/components/otp-field";

const meta = {
  title: "Shadcn/OTP Field",
  component: OTPField,
  tags: ["autodocs"],
  args: {
    id: "verification-code",
    name: "code",
  },
  decorators: [
    (Story) => (
      <div className="flex flex-col gap-2">
        <Label htmlFor="verification-code">Verification code</Label>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OTPField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Masked: Story = {
  args: {
    mask: true,
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: "123456",
    disabled: true,
  },
};

export const Invalid: Story = {
  args: {
    defaultValue: "123",
    invalid: true,
  },
};
