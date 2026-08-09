"use client";

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "@repo/ui/components/label";
import { PhoneNumberInput } from "@repo/ui/components/phone-number-input";

const meta = {
  title: "Shadcn/Phone Number Input",
  component: PhoneNumberInput,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PhoneNumberInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function PhoneNumberInputDemo({
  defaultValue,
  disabled,
  errorMessage,
  locale = "en",
}: {
  defaultValue?: string;
  disabled?: boolean;
  errorMessage?: string;
  locale?: string;
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="phone-number-demo">Phone number</Label>
      <PhoneNumberInput
        id="phone-number-demo"
        value={value}
        disabled={disabled}
        errorMessage={errorMessage}
        locale={locale}
        onValueChange={setValue}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <PhoneNumberInputDemo />,
};

export const ExistingNumber: Story = {
  render: () => <PhoneNumberInputDemo defaultValue="+40712345678" />,
};

export const Romanian: Story = {
  render: () => <PhoneNumberInputDemo locale="ro" />,
};

export const Invalid: Story = {
  render: () => (
    <PhoneNumberInputDemo errorMessage="Enter a valid phone number." />
  ),
};

export const Disabled: Story = {
  render: () => <PhoneNumberInputDemo defaultValue="+40712345678" disabled />,
};
