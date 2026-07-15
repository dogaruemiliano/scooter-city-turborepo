"use client";

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  DatePartsInput,
  type DateParts,
} from "@repo/ui/components/date-parts-input";
import { Label } from "@repo/ui/components/label";
import { emptyDateParts } from "@repo/ui/lib/date-parts";

const meta = {
  title: "Shadcn/Date Parts Input",
  component: DatePartsInput,
  tags: ["autodocs"],
  args: {
    baseId: "purchase-date",
    label: "Purchased on",
    locale: "en",
    value: emptyDateParts(),
    onChange: () => undefined,
  },
  argTypes: {
    locale: {
      control: "inline-radio",
      options: ["en", "ro"],
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DatePartsInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function DatePartsInputDemo({
  defaultValue = emptyDateParts(),
  disabled,
  invalid,
  label = "Purchased on",
  locale = "en",
}: {
  defaultValue?: DateParts;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
  locale?: string;
}) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="date-parts-demo-day">{label}</Label>
      <DatePartsInput
        baseId="date-parts-demo"
        disabled={disabled}
        invalid={invalid}
        label={label}
        locale={locale}
        value={value}
        onChange={setValue}
      />
      {invalid ? (
        <p className="text-sm text-destructive">Enter a valid date.</p>
      ) : null}
    </div>
  );
}

export const Default: Story = {
  render: (args) => (
    <DatePartsInputDemo label={args.label} locale={args.locale} />
  ),
};

export const Romanian: Story = {
  render: (args) => <DatePartsInputDemo label={args.label} locale="ro" />,
};

export const Invalid: Story = {
  render: (args) => (
    <DatePartsInputDemo invalid label={args.label} locale={args.locale} />
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <DatePartsInputDemo
      disabled
      defaultValue={{ day: "15", month: "07", year: "2026" }}
      label={args.label}
      locale={args.locale}
    />
  ),
};
