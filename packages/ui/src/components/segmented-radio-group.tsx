"use client";

import type * as React from "react";

import { cn } from "@repo/ui/lib/utils";

type SegmentedRadioOption<Value extends string> = {
  value: Value;
  label: React.ReactNode;
  tone?: "primary" | "neutral" | "destructive";
  disabled?: boolean;
};

type SegmentedRadioGroupProps<Value extends string> = Omit<
  React.ComponentProps<"div">,
  "onChange" | "children" | "role" | "aria-label"
> & {
  label: string;
  name: string;
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly SegmentedRadioOption<Value>[];
  disabled?: boolean;
};

const selectedTone = {
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
} as const;

/** One required selection, using native radios for keyboard and form behavior. */
function SegmentedRadioGroup<Value extends string>({
  label,
  name,
  value,
  onValueChange,
  options,
  disabled,
  className,
  ...props
}: SegmentedRadioGroupProps<Value>) {
  return (
    <div
      {...props}
      data-slot="segmented-radio-group"
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex min-w-0 rounded-lg border border-input bg-background p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled || option.disabled}
            onChange={() => onValueChange(option.value)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "flex min-h-11 w-full items-center justify-center rounded-md px-2 text-xs font-semibold outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed",
              value === option.value
                ? selectedTone[option.tone ?? "neutral"]
                : "text-muted-foreground hover:bg-muted peer-disabled:bg-disabled peer-disabled:text-disabled-foreground",
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export {
  SegmentedRadioGroup,
  type SegmentedRadioGroupProps,
  type SegmentedRadioOption,
};
