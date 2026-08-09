"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { VariantProps } from "class-variance-authority";

import { Toggle, toggleVariants } from "@repo/ui/components/toggle";
import { cn } from "@repo/ui/lib/utils";

function ToggleGroup<Value extends string>({
  className,
  ...props
}: ToggleGroupPrimitive.Props<Value>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn("flex w-fit items-center gap-2", className)}
      {...props}
    />
  );
}

function ToggleGroupItem<Value extends string>({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof Toggle<Value>> &
  VariantProps<typeof toggleVariants>) {
  return (
    <Toggle
      data-slot="toggle-group-item"
      variant={variant}
      size={size}
      className={cn("flex-1", className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
