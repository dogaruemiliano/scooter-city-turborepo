"use client";

import { useId } from "react";

import { Input, Label } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";

export function TextInputField({
  label,
  value,
  onChange,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  const id = useId();

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
