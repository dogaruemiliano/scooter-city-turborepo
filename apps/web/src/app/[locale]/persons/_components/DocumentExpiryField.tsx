"use client";

import { Field, FieldLabel, Switch } from "@repo/ui/components";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

export function DocumentExpiryField({
  switchId,
  switchLabel,
  checked,
  switchDisabled = false,
  className,
  children,
  onCheckedChange,
}: {
  switchId: string;
  switchLabel: string;
  checked: boolean;
  switchDisabled?: boolean;
  className?: string;
  children: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      {children}
      <Field orientation="horizontal">
        <FieldLabel htmlFor={switchId}>{switchLabel}</FieldLabel>
        <Switch
          id={switchId}
          checked={checked}
          disabled={switchDisabled}
          onCheckedChange={onCheckedChange}
        />
      </Field>
    </div>
  );
}
