"use client";

import type * as React from "react";
import { CheckIcon } from "lucide-react";

import { cn } from "@repo/ui/lib/utils";

type SegmentedRadioOption<Value extends string> = {
  value: Value;
  label: React.ReactNode;
  tone?:
    | "primary"
    | "neutral"
    | "destructive"
    | "success"
    | "destructiveSubtle"
    | "successSubtle";
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
  /** Clicking the selected option again restores this empty value. */
  deselectValue?: Value;
  showCheckmark?: boolean;
  optionClassName?: string;
};

const selectedTone = {
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-card text-card-foreground shadow-sm",
  destructive: "bg-destructive text-destructive-foreground",
  success: "bg-success text-success-foreground",
  destructiveSubtle: "bg-destructive-subtle text-destructive",
  successSubtle: "bg-success-subtle text-success",
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
  deselectValue,
  showCheckmark = false,
  optionClassName,
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
            className={cn(
              "flex min-h-11 min-w-0 cursor-pointer",
              optionClassName,
            )}
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
              onClick={() => {
                if (deselectValue !== undefined && value === option.value)
                  onValueChange(deselectValue);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === " " &&
                  deselectValue !== undefined &&
                  value === option.value
                ) {
                  event.preventDefault();
                  onValueChange(deselectValue);
                }
              }}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-11 w-full min-w-0 items-center justify-center gap-1 rounded-md px-2 py-2 text-center text-xs font-semibold wrap-anywhere outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed",
                value === option.value
                  ? selectedTone[option.tone ?? "neutral"]
                  : "text-muted-foreground hover:bg-muted peer-disabled:bg-disabled peer-disabled:text-disabled-foreground",
                optionClassName,
              )}
            >
              {showCheckmark ? (
                <CheckIcon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    value !== option.value && "invisible",
                  )}
                />
              ) : null}
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
