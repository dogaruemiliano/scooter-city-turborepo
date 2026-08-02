"use client";

import { useId } from "react";

import { DatePartsField, Input, Label } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import { useLocale } from "next-intl";

export function TextInputField({
  label,
  value,
  onChange,
  date = false,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  date?: boolean;
  type?: string;
  className?: string;
}) {
  const id = useId();
  const locale = useLocale();

  if (date) {
    return (
      <div className={cn("grid gap-2", className)}>
        <Label htmlFor={`${id}-day`}>{label}</Label>
        <DatePartsField
          baseId={id}
          label={label}
          locale={locale}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
