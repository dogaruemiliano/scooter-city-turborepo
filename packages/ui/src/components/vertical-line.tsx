import type { ComponentProps } from "react";

import { cn } from "@repo/ui/lib/utils";

/** Decorative accent shared by section and sheet headings. */
function VerticalLine({
  className,
  ...props
}: Omit<ComponentProps<"span">, "children" | "aria-hidden">) {
  return (
    <span
      {...props}
      data-slot="vertical-line"
      aria-hidden="true"
      className={cn("h-5 w-1 shrink-0 rounded-full bg-foreground", className)}
    />
  );
}

export { VerticalLine };
