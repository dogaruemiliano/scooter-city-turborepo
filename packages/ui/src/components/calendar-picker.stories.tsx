"use client";

import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@repo/ui/components/button";
import { CalendarPicker } from "@repo/ui/components/calendar-picker";

const meta = {
  title: "Shadcn/Calendar Picker",
  component: CalendarPicker,
  tags: ["autodocs"],
  args: {
    title: "From",
    description: "Choose the first day included in the statement export.",
    locale: "en",
    minYear: 1900,
    maxYear: 2100,
    renderTrigger: <Button variant="outline" />,
    today: "2026-07-05",
    triggerLabel: "Select date",
  },
  argTypes: {
    locale: {
      control: "inline-radio",
      options: ["en", "ro"],
    },
  },
} satisfies Meta<typeof CalendarPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

function CalendarPickerDemo({
  defaultValue = "2026-07-01",
  defaultOpen,
  defaultSelectorOpen,
  description,
  locale = "en",
  maxYear = 2100,
  minYear = 1900,
  theme = "light",
  title = "From",
  today = "2026-07-05",
}: {
  defaultValue?: string;
  defaultOpen?: boolean;
  defaultSelectorOpen?: boolean;
  description?: React.ReactNode;
  locale?: string;
  maxYear?: number;
  minYear?: number;
  theme?: "dark" | "light";
  title?: React.ReactNode;
  today?: string;
}) {
  const [value, setValue] = React.useState<string | null>(defaultValue);

  return (
    <div
      className={
        theme === "dark"
          ? "dark flex min-h-96 items-start justify-center bg-background p-8"
          : "flex min-h-96 items-start justify-center bg-background p-8"
      }
    >
      <CalendarPicker
        defaultOpen={defaultOpen}
        defaultSelectorOpen={defaultSelectorOpen}
        description={description}
        locale={locale}
        maxYear={maxYear}
        minYear={minYear}
        onValueChange={setValue}
        renderTrigger={<Button variant="outline" />}
        title={title}
        today={today}
        triggerLabel={value ?? "Select date"}
        value={value}
      />
    </div>
  );
}

export const Default: Story = {
  render: (args) => (
    <CalendarPickerDemo
      description={args.description}
      locale={args.locale}
      maxYear={args.maxYear}
      minYear={args.minYear}
      title={args.title}
      today={args.today}
    />
  ),
};

export const Open: Story = {
  render: (args) => (
    <CalendarPickerDemo
      defaultOpen
      description={args.description}
      locale={args.locale}
      maxYear={args.maxYear}
      minYear={args.minYear}
      title={args.title}
      today={args.today}
    />
  ),
};

export const SelectorOpen: Story = {
  render: (args) => (
    <CalendarPickerDemo
      defaultOpen
      defaultSelectorOpen
      description={args.description}
      locale={args.locale}
      maxYear={args.maxYear}
      minYear={args.minYear}
      title={args.title}
      today={args.today}
    />
  ),
};

export const DarkOpen: Story = {
  render: (args) => (
    <CalendarPickerDemo
      defaultOpen
      description={args.description}
      locale={args.locale}
      maxYear={args.maxYear}
      minYear={args.minYear}
      theme="dark"
      title={args.title}
      today={args.today}
    />
  ),
};

export const WithoutDescription: Story = {
  render: (args) => (
    <CalendarPickerDemo
      description={undefined}
      locale={args.locale}
      maxYear={args.maxYear}
      minYear={args.minYear}
      title={args.title}
      today={args.today}
    />
  ),
};
