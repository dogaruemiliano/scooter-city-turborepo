import * as React from "react";

import { cn } from "@repo/ui/lib/utils";

function Textarea({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"textarea"> & {
  /** Inline editing preserves surrounding typography and surface, without field chrome. */
  variant?: "default" | "inline";
}) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      className={cn(
        "field-sizing-content w-full outline-none disabled:cursor-not-allowed",
        variant === "inline"
          ? "block min-h-0 resize-none border-0 bg-transparent p-0 whitespace-pre-wrap wrap-anywhere select-text"
          : "flex min-h-24 rounded-lg border border-input bg-control px-3 py-3 text-base transition-colors duration-fast ease-standard placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-2 focus-visible:ring-border disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive md:min-h-20 md:py-2.5 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
