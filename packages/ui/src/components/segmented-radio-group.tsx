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
  inputRef?: React.Ref<HTMLInputElement>;
};

const selectedTone = {
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-card text-card-foreground shadow-sm",
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
  id,
  inputRef,
  className,
  ...props
}: SegmentedRadioGroupProps<Value>) {
  const focusIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div className="@container/segmented min-w-0">
      <div
        {...props}
        style={
          {
            ...props.style,
            "--segmented-columns": options.length,
          } as React.CSSProperties
        }
        data-slot="segmented-radio-group"
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        className={cn(
          "grid min-w-0 grid-cols-2 rounded-xl border border-input bg-muted p-1 @form-controls/segmented:grid-cols-[repeat(var(--segmented-columns),minmax(0,1fr))]",
          className,
        )}
      >
        {options.map((option, index) => (
          <label
            key={option.value}
            className="flex min-h-11 min-w-0 cursor-pointer"
          >
            <input
              id={index === focusIndex ? id : undefined}
              ref={index === focusIndex ? inputRef : undefined}
              aria-describedby={props["aria-describedby"]}
              aria-invalid={props["aria-invalid"]}
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
                "flex min-h-11 w-full min-w-0 items-center justify-center rounded-md px-2 py-2 text-center text-xs font-semibold wrap-anywhere outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed",
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
    </div>
  );
}

export {
  SegmentedRadioGroup,
  type SegmentedRadioGroupProps,
  type SegmentedRadioOption,
};
