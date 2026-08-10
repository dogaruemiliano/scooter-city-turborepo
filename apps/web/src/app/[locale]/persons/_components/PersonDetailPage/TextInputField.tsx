"use client";

import { useId } from "react";

import { Input, Label } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";

import { DatePartsField } from "@/components/DateField";

export function TextInputField({
  label,
  value,
  onChange,
  date = false,
  type = "text",
  className,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  date?: boolean;
  type?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();

  if (date) {
    return (
      <div
        data-disabled={disabled || undefined}
        className={cn("grid gap-2", className)}
      >
        <Label
          htmlFor={`${id}-day`}
          className={cn(
            "flex items-center gap-1",
            disabled && "text-disabled-foreground",
          )}
        >
          {label}
          {required ? (
            <span aria-hidden="true" className="text-current">
              *
            </span>
          ) : null}
        </Label>
        <DatePartsField
          baseId={id}
          label={label}
          value={value}
          disabled={disabled}
          required={required}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div
      data-disabled={disabled || undefined}
      className={cn("grid gap-2", className)}
    >
      <Label
        htmlFor={id}
        className={cn(
          "flex items-center gap-1",
          disabled && "text-disabled-foreground",
        )}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-current">
            *
          </span>
        ) : null}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
