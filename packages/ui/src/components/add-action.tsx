"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { pickerCardBorder } from "@repo/ui/lib/picker-styles";
import { cn } from "@repo/ui/lib/utils";

export type AddActionProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "variant" | "size"
> & {
  text: string;
  icon: ReactNode;
  subtext?: string;
  /** Compact actions use less vertical padding and standard input height. */
  size?: "default" | "compact";
};

/** Shared collection-add control. The icon/text row stays at the surface center. */
export function AddAction({
  text,
  icon,
  subtext,
  size = "default",
  className,
  type = "button",
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  ...props
}: AddActionProps) {
  const subtextId = useId();
  return (
    <Button
      {...props}
      type={type}
      variant="outline"
      data-slot="add-action"
      aria-label={ariaLabel ?? text}
      aria-describedby={
        [describedBy, subtext ? subtextId : undefined]
          .filter(Boolean)
          .join(" ") || undefined
      }
      className={cn(
        "w-full rounded-dashed-surface bg-control px-4 text-center",
        pickerCardBorder,
        size === "compact" ? "min-h-12 py-2 md:min-h-11" : "min-h-20 py-4",
        subtext
          ? "grid grid-rows-3 place-items-center gap-1"
          : "flex items-center justify-center",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center gap-2",
          subtext && "row-start-2",
        )}
      >
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center"
        >
          {icon}
        </span>
        <span>{text}</span>
      </span>
      {subtext ? (
        <span
          id={subtextId}
          className="row-start-3 text-sm font-normal text-muted-foreground"
        >
          {subtext}
        </span>
      ) : null}
    </Button>
  );
}
