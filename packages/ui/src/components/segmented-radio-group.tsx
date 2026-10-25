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
    | "secondary"
    | "info"
    | "warning"
    | "personal"
    | "destructive"
    | "success"
    | "destructiveSubtle"
    | "successSubtle";
  /** Semantic difficulty colors remain visible before selection. */
  difficulty?: "easy" | "medium" | "hard";
  /** Use the option tone for unselected text as well as its selected fill. */
  colorUnselected?: boolean;
  /** Use a tinted surface for unselected options. */
  subtleUnselected?: boolean;
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
  required?: boolean;
  /** Clicking the selected option again restores this empty value. */
  deselectValue?: Value;
  showCheckmark?: boolean;
  optionClassName?: string;
  appearance?: "segmented" | "pills";
  /** Layout placement belongs on the outer query container. */
  containerClassName?: string;
  /** Keep a fixed number of columns instead of expanding to a single row. */
  columns?: 1 | 2 | 3 | 4;
};

const selectedTone = {
  secondary: "bg-secondary text-secondary-foreground",
  info: "bg-info text-info-foreground",
  warning: "bg-warning-strong text-warning-strong-foreground",
  personal: "bg-personal text-personal-foreground",
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-card text-card-foreground shadow-sm",
  destructive: "bg-destructive text-destructive-foreground",
  success: "bg-success text-success-foreground",
  destructiveSubtle: "bg-destructive-subtle text-destructive",
  successSubtle: "bg-success-subtle text-success",
} as const;

const difficultyTone = {
  easy: "bg-difficulty-easy text-difficulty-foreground",
  medium: "bg-difficulty-medium text-difficulty-foreground",
  hard: "bg-difficulty-hard text-difficulty-foreground",
} as const;

const difficultyTextTone = {
  easy: "text-difficulty-easy",
  medium: "text-difficulty-medium",
  hard: "text-difficulty-hard",
} as const;

const unselectedTone = {
  secondary: "text-muted-foreground",
  info: "text-info",
  warning: "text-warning-text",
  personal: "text-personal",
  primary: "text-primary",
  neutral: "text-muted-foreground",
  destructive: "text-destructive",
  success: "text-success",
  destructiveSubtle: "text-destructive",
  successSubtle: "text-success",
} as const;

const unselectedSurface = {
  primary: "bg-accent",
  neutral: "bg-muted",
  secondary: "bg-muted",
  info: "bg-info-subtle",
  warning: "bg-warning-subtle",
  personal: "bg-personal-subtle",
  success: "bg-success-subtle",
  destructive: "bg-destructive-subtle",
  destructiveSubtle: "bg-destructive-subtle",
  successSubtle: "bg-success-subtle",
} as const;

/** Controlled selection with optional deselection and native radio keyboard behavior. */
function SegmentedRadioGroup<Value extends string>({
  label,
  name,
  value,
  onValueChange,
  options,
  disabled,
  required = false,
  id,
  inputRef,
  deselectValue,
  showCheckmark = false,
  optionClassName,
  appearance = "segmented",
  containerClassName,
  columns,
  className,
  ...props
}: SegmentedRadioGroupProps<Value>) {
  const focusIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  // Each shared edge belongs to the option after/below it. Keep the two
  // responsive layouts in sync without measuring or observing the DOM.
  const hasDivider = (
    index: number,
    columnCount: number,
    axis: "row" | "column",
  ) => (axis === "column" ? index % columnCount !== 0 : index >= columnCount);
  return (
    <div className={cn("@container/segmented min-w-0", containerClassName)}>
      <div
        {...props}
        style={
          {
            ...props.style,
            "--segmented-columns": columns ?? options.length,
          } as React.CSSProperties
        }
        data-slot="segmented-radio-group"
        role="radiogroup"
        aria-label={label}
        aria-disabled={disabled || undefined}
        aria-required={required || undefined}
        className={cn(
          "grid min-h-12 min-w-0 grid-cols-2 rounded-xl border border-(--radio-border) [--radio-border:var(--control-border,var(--input))] bg-muted p-1 md:min-h-11 @form-controls/segmented:grid-cols-[repeat(var(--segmented-columns),minmax(0,1fr))]",
          columns !== undefined &&
            "grid-cols-[repeat(var(--segmented-columns),minmax(0,1fr))]",
          appearance === "pills" &&
            "flex min-h-10 flex-wrap gap-2 rounded-none border-0 bg-transparent p-0 md:min-h-10",
          className,
        )}
      >
        {options.map((option, index) => (
          <label
            key={option.value}
            className={cn(
              "relative flex min-h-10 min-w-0 cursor-pointer md:min-h-9",
              appearance === "segmented" &&
                cn(
                  "p-0.5",
                  "before:pointer-events-none before:absolute before:inset-y-2 before:left-0 before:rounded-full before:border-l before:border-(--radio-border) after:pointer-events-none after:absolute after:inset-x-3 after:top-0 after:rounded-full after:border-t after:border-(--radio-border)",
                  hasDivider(index, columns ?? 2, "column")
                    ? "before:block"
                    : "before:hidden",
                  hasDivider(index, columns ?? 2, "row")
                    ? "after:block"
                    : "after:hidden",
                  hasDivider(index, columns ?? options.length, "column")
                    ? "@form-controls/segmented:before:block"
                    : "@form-controls/segmented:before:hidden",
                  hasDivider(index, columns ?? options.length, "row")
                    ? "@form-controls/segmented:after:block"
                    : "@form-controls/segmented:after:hidden",
                ),
              appearance === "pills" && "min-h-10 items-center md:min-h-10",
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
              required={required}
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
                "flex min-h-0 w-full min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-center text-sm font-medium wrap-anywhere outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed",
                appearance === "pills" &&
                  "min-h-8 rounded-full border border-border px-4 py-1",
                value !== option.value &&
                  !disabled &&
                  !option.disabled &&
                  "hover:bg-secondary-hover active:bg-secondary-active peer-active:bg-secondary-active",
                option.difficulty
                  ? cn(
                      value === option.value
                        ? difficultyTone[option.difficulty]
                        : difficultyTextTone[option.difficulty],
                      "peer-disabled:opacity-50",
                    )
                  : value === option.value
                    ? selectedTone[option.tone ?? "neutral"]
                    : cn(
                        option.colorUnselected
                          ? unselectedTone[option.tone ?? "neutral"]
                          : "text-muted-foreground",
                        option.subtleUnselected &&
                          unselectedSurface[option.tone ?? "neutral"],
                        "peer-disabled:bg-disabled peer-disabled:text-disabled-foreground",
                      ),
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
              {showCheckmark ? (
                <span aria-hidden="true" className="size-4 shrink-0" />
              ) : null}
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
